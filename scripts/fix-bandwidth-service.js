const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/modules/bandwidth/bandwidth.service.ts');
let content = fs.readFileSync(filePath, 'utf8');
// Normalize to LF
const normalized = content.replace(/\r\n/g, '\n');

const startMarker = '    // Group VMs by compartment\n    const compartmentMap = new Map<string, any>();';
const endMarker = '  // ────────────────────────────────────────\n  // Monthly archiving (called by cron task)\n  // ────────────────────────────────────────';

const startIdx = normalized.indexOf(startMarker);
const endIdx = normalized.indexOf(endMarker, startIdx);

if (startIdx < 0 || endIdx < 0) {
  console.error('Could not find markers. startIdx=' + startIdx + ' endIdx=' + endIdx);
  process.exit(1);
}

console.log('Found section from', startIdx, 'to', endIdx);

const newSection = `    // ── Group active VMs by compartment ──────────────────────────
    const compartmentMap = new Map<string, any>();
    for (const vm of vmData) {
      const cid = vm.compartmentId;
      if (!compartmentMap.has(cid)) {
        compartmentMap.set(cid, {
          compartmentId: cid,
          compartmentName: compartmentNameMap.get(cid) || cid,
          vmCount: 0,
          vmsWithData: 0,
          egressTB: 0,
          ingressTB: 0,
          vms: [],
          deletedVmsSummary: null,
        });
      }
      const group = compartmentMap.get(cid)!;
      group.vmCount++;
      const ds = vm.bandwidth?.dataSource;
      if (ds !== 'none' && ds !== 'error') group.vmsWithData++;
      group.egressTB = parseFloat(
        (group.egressTB + (vm.bandwidth?.egressTB || 0)).toFixed(6),
      );
      group.ingressTB = parseFloat(
        (group.ingressTB + (vm.bandwidth?.ingressTB || 0)).toFixed(6),
      );
      group.vms.push(vm);
    }

    // ── Deleted VM bandwidth (Source A: DB snapshots; Source B: OCI groupBy) ─
    const deletedFromDB = await this.getDeletedVmsSnapshotsForMonth(yearMonth);
    let deletedFromOci: Map<string, { bytesOut: number; bytesIn: number; count: number }> | null = null;
    if (this.isWithinOciRetention(endTime)) {
      deletedFromOci = await this.getDeletedVmsOciForCompartments(
        Array.from(compartmentMap.keys()), compartmentMap, startTime, endTime,
      );
    }

    const deletedMerged = new Map<
      string,
      { bytesOut: number; bytesIn: number; count: number; dataSource: 'archived' | 'oci' }
    >();
    for (const [cid, row] of deletedFromDB.entries()) {
      deletedMerged.set(cid, { ...row, dataSource: 'archived' });
    }
    if (deletedFromOci) {
      for (const [cid, ociRow] of deletedFromOci.entries()) {
        if (ociRow.count === 0) continue;
        const existing = deletedMerged.get(cid);
        if (existing) {
          deletedMerged.set(cid, {
            bytesOut: existing.bytesOut + ociRow.bytesOut,
            bytesIn: existing.bytesIn + ociRow.bytesIn,
            count: Math.max(existing.count, ociRow.count),
            dataSource: 'archived',
          });
        } else {
          deletedMerged.set(cid, { ...ociRow, dataSource: 'oci' });
        }
      }
    }

    let totalDeletedVMs = 0;
    let totalDeletedEgressTB = 0;
    let totalDeletedIngressTB = 0;

    for (const [cid, del] of deletedMerged.entries()) {
      const egressTB = parseFloat((del.bytesOut / 1024 ** 4).toFixed(6));
      const ingressTB = parseFloat((del.bytesIn / 1024 ** 4).toFixed(6));
      const deletedSummary = { count: del.count, egressTB, ingressTB, dataSource: del.dataSource };
      totalDeletedVMs += del.count;
      totalDeletedEgressTB += egressTB;
      totalDeletedIngressTB += ingressTB;
      if (compartmentMap.has(cid)) {
        compartmentMap.get(cid)!.deletedVmsSummary = deletedSummary;
      } else {
        compartmentMap.set(cid, {
          compartmentId: cid,
          compartmentName: compartmentNameMap.get(cid) || cid,
          vmCount: 0, vmsWithData: 0,
          egressTB: 0, ingressTB: 0,
          vms: [],
          deletedVmsSummary: deletedSummary,
        });
      }
    }

    summary['totalDeletedVMs'] = totalDeletedVMs;
    summary['totalEgressTBIncDeleted'] = parseFloat(
      (summary.totalEgressTB + totalDeletedEgressTB).toFixed(6),
    );
    summary['totalIngressTBIncDeleted'] = parseFloat(
      (summary.totalIngressTB + totalDeletedIngressTB).toFixed(6),
    );

    const compartments = Array.from(compartmentMap.values()).sort((a, b) => {
      const aTotal = a.egressTB + (a.deletedVmsSummary?.egressTB || 0);
      const bTotal = b.egressTB + (b.deletedVmsSummary?.egressTB || 0);
      return bTotal - aTotal;
    });

    return { summary, compartments, vms: vmData, month: yearMonth };
  }

  // ────────────────────────────────────────
  // Deleted VM bandwidth helpers
  // ────────────────────────────────────────

  /**
   * Query DB snapshots for VMs whose instance_id no longer exists in vm_instances.
   * Returns: compartmentId -> { bytesOut, bytesIn, count }
   */
  private async getDeletedVmsSnapshotsForMonth(
    yearMonth: string,
  ): Promise<Map<string, { bytesOut: number; bytesIn: number; count: number }>> {
    const result = new Map<string, { bytesOut: number; bytesIn: number; count: number }>();
    try {
      const rows: Array<{
        compartment_id: string;
        total_bytes_out: string;
        total_bytes_in: string;
        vm_count: string;
      }> = await this.dataSource.query(
        \`SELECT
            bms.compartment_id,
            SUM(bms.bytes_out_total)        AS total_bytes_out,
            SUM(bms.bytes_in_total)         AS total_bytes_in,
            COUNT(DISTINCT bms.instance_id) AS vm_count
         FROM oracle.bandwidth_monthly_snapshots bms
         WHERE bms.year_month     = $1
           AND bms.compartment_id IS NOT NULL
           AND bms.instance_id NOT IN (
               SELECT instance_id FROM oracle.vm_instances WHERE instance_id IS NOT NULL
           )
         GROUP BY bms.compartment_id\`,
        [yearMonth],
      );
      for (const row of rows) {
        if (!row.compartment_id) continue;
        result.set(row.compartment_id, {
          bytesOut: parseFloat(row.total_bytes_out) || 0,
          bytesIn: parseFloat(row.total_bytes_in) || 0,
          count: parseInt(row.vm_count, 10) || 0,
        });
      }
      this.logger.log(
        \`Deleted-VM DB snapshots for \${yearMonth}: \${result.size} compartments with data\`,
      );
    } catch (err) {
      this.logger.warn(\`getDeletedVmsSnapshotsForMonth failed: \${err.message}\`);
    }
    return result;
  }

  /**
   * Use OCI compartment-level groupBy metrics to find bandwidth from deleted VMs.
   * Returns: compartmentId -> { bytesOut, bytesIn, count }
   */
  private async getDeletedVmsOciForCompartments(
    compartmentIds: string[],
    compartmentMap: Map<string, any>,
    startTime: Date,
    endTime: Date,
  ): Promise<Map<string, { bytesOut: number; bytesIn: number; count: number }>> {
    const result = new Map<string, { bytesOut: number; bytesIn: number; count: number }>();
    for (const cid of compartmentIds) {
      try {
        const allVnicData = await this.ociService.getCompartmentAllVnicsBandwidth(
          cid, startTime, endTime,
        );
        if (Object.keys(allVnicData).length === 0) continue;
        const activeVnicIds = new Set<string>(
          (compartmentMap.get(cid)?.vms ?? []).map((vm: any) => vm.vnicId || null).filter(Boolean),
        );
        let dOut = 0, dIn = 0, dCount = 0;
        for (const [vnicId, data] of Object.entries(allVnicData) as any) {
          if (activeVnicIds.has(vnicId)) continue;
          dOut += data.bytesOut; dIn += data.bytesIn; dCount++;
        }
        if (dCount > 0) result.set(cid, { bytesOut: dOut, bytesIn: dIn, count: dCount });
      } catch (err) {
        this.logger.warn(\`getDeletedVmsOciForCompartments [\${cid}]: \${err.message}\`);
      }
    }
    this.logger.log(\`OCI deleted-VM groupBy: \${result.size} compartments with data\`);
    return result;
  }

`;

const newContent = normalized.substring(0, startIdx) + newSection + normalized.substring(endIdx);
const withCRLF = newContent.replace(/\n/g, '\r\n');
fs.writeFileSync(filePath, withCRLF, 'utf8');
console.log('Done. Written', withCRLF.length, 'bytes');
