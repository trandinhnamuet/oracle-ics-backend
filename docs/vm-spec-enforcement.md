# Thực thi cấu hình VM từ Gói Cloud

## Tổng quan

Khi người dùng cấu hình một VM cho subscription của họ, hệ thống hiện nay sẽ **thực thi** chính xác các thông số được định nghĩa trong gói cloud tương ứng. Người dùng không còn chọn `shape` nữa — backend sẽ tự động chọn `shape` rẻ nhất nhưng vẫn tương thích.

## Vấn đề (Trước đây)

- Bảng `cloud_packages` trước đó lưu thông số dưới dạng chuỗi (ví dụ: "8 vCPU", "16GB RAM", "100GB SSD Storage").
- Backend không đọc những chuỗi này khi tạo VM.
- Người dùng có thể tạo VM với bất kỳ cấu hình nào, không cần đúng cấu hình đã mua.
- Không có kiểm tra/ép buộc phía server để đảm bảo VM khớp gói đã mua.

## Giải pháp

### 1. Migration cơ sở dữ liệu

**File:** `oracle-ics-backend/src/migrations/20260408120000-AddNumericSpecsToCloudPackages.ts`

Thêm ba cột số vào bảng `cloud_packages`:

| Cột | Kiểu | Mặc định | Mô tả |
|-----|------|---------:|-------|
| `required_ocpus` | integer | 1 | Số OCPU cần thiết |
| `required_memory_gbs` | integer | 1 | RAM tính theo GB |
| `required_boot_volume_gbs` | integer | 50 | Kích thước boot volume (GB), tối thiểu 50 |

Migration này cũng sẽ parse các chuỗi hiện có:
- "8 vCPU" → `required_ocpus = 8`
- "16GB RAM" → `required_memory_gbs = 16`
- "100GB SSD Storage" → `required_boot_volume_gbs = 100` (với ngưỡng tối thiểu 50)

### 2. Thực thi ở backend (`VmSubscriptionService`)

**File:** `oracle-ics-backend/src/modules/vm-subscription/vm-subscription.service.ts`

Trong `configureSubscriptionVm()` đã thực hiện các bước sau:

1. Đọc `required_ocpus`, `required_memory_gbs`, `required_boot_volume_gbs` từ `subscription.cloudPackage`.
2. Kiểm tra hợp lệ (nếu bằng 0 thì package không hỗ trợ provisioning — ví dụ gói tư vấn) và từ chối với `BadRequestException` nếu cần.
3. Phát hiện kiến trúc ảnh (ARM hoặc x86) qua `this.detectImageArchitecture(imageId)` (dựa vào `ociService.getImage()` và `displayName`/`operatingSystem`).
4. Gọi `this.selectBestShape(requiredOcpus, requiredMemoryGBs, imageArch)` để chọn `shape` rẻ nhất tương thích.
5. Ghi đè mọi giá trị do user gửi bằng `enforcedCreateVmParams` chứa `imageId`, `shape`, `ocpus`, `memoryInGBs`, `bootVolumeSizeInGBs`, `subscriptionId`, `description`.
6. Gọi provisioning với các tham số bắt buộc (bao gồm `displayName` và SSH key tạo/thu thập cho user).

Hai helper chính:
- `detectImageArchitecture(imageId)` — lấy thông tin ảnh từ OCI, check `displayName`/`operatingSystem` chứa các chuỗi như `aarch64`, `arm64`, `arm` để xác định `AARCH64` (ARM) hoặc mặc định `X86_64`.
- `selectBestShape(requiredOcpus, requiredMemoryGBs, imageArch)` — chọn shape phù hợp theo thứ tự ưu tiên giá rẻ → mắc.

### 3. Cách chọn `shape` tự động

Danh sách `shape` được ưu tiên từ rẻ đến đắt (ví dụ hiện tại):

| Thứ tự | Shape | Kiến trúc | Loại | Giới hạn OCPU | Giới hạn RAM |
|--------:|-------|----------|------|--------------:|-------------:|
| 1 | `VM.Standard.A1.Flex` | ARM | Flex | 1–4 | 1–24 GB |
| 2 | `VM.Standard.E2.1.Micro` | x86 | Fixed | 1 | 1 GB |
| 3 | `VM.Standard.E3.Flex` | x86 | Flex | 1–64 | 1–1024 GB |
| 4 | `VM.Standard3.Flex` | x86 | Flex | 1–64 | 1–1024 GB |
| 5 | `VM.Standard2.1` | x86 | Fixed | 1 | 15 GB |

Thuật toán:
1. Lọc theo kiến trúc ảnh: ARM → chỉ xem `A1.Flex`; x86 → xem các shape x86.
2. Lọc theo năng lực: `shape.maxOcpus >= requiredOcpus` và `shape.maxMemGBs >= requiredMemoryGBs`.
3. Lấy phần tử đầu tiên khớp (đó là shape rẻ nhất theo danh sách).
4. Nếu không tìm được shape tương thích → ném `BadRequestException` với thông báo rõ ràng.

### 4. Thay đổi ở frontend

**File chính:** `oracle-ics-frontend/app/cloud/configuration/[subscriptionId]/page.tsx`

- Bỏ UI chọn `shape` (card chọn shape và state liên quan). Người dùng không còn thao tác chọn shape.
- Thêm card "Package Specifications" hiển thị `required_ocpus`, `required_memory_gbs`, `required_boot_volume_gbs` từ `subscription.cloudPackage` (nếu backend đã cung cấp).
- Lấy danh sách images mà không filter theo `shape` (gọi `getComputeImages()` không truyền `shape`).
- Khi gửi request cấu hình, frontend chỉ gửi `{ imageId, notificationEmail }`.

Thay đổi kiểu API phía client:

**File:** `oracle-ics-frontend/api/vm-subscription.api.ts`

- `ConfigureVmDto`: các trường `shape`, `ocpus`, `memoryInGBs`, `bootVolumeSizeInGBs` đã là optional.

### 5. Thay đổi DTO backend

**File:** `oracle-ics-backend/src/modules/vm-subscription/dto/configure-vm.dto.ts`

- `shape` thay từ `@IsNotEmpty()` sang `@IsOptional()` để cho phép backend tự chọn shape.

## Luồng API (tóm tắt)

```
POST /vm-subscription/:subscriptionId/configure
Body: { imageId: "ocid1.image...", notificationEmail: "user@example.com" }

Backend:
  1. checkSubscriptionEligibility() → load relation cloudPackage
  2. Đọc pkg.required_ocpus, pkg.required_memory_gbs, pkg.required_boot_volume_gbs
  3. Từ chối nếu specs = 0 (gói không bao gồm provisioning)
  4. detectImageArchitecture(imageId) → 'AARCH64' | 'X86_64'
  5. selectBestShape(ocpus, memoryGBs, arch) → ví dụ 'VM.Standard.A1.Flex'
  6. Tạo enforcedCreateVmParams (ghi đè input client)
  7. Gọi provisioning với enforced params + displayName + ssh keys
```

## Chạy migration

Chạy lệnh migration như sau:

```bash
cd oracle-ics-backend
npx typeorm migration:run -d src/config/data-source.ts
```

---

Nếu bạn muốn, tôi có thể tiếp tục: chạy migration trên môi trường dev, build backend để kiểm tra lỗi TypeScript, hoặc viết thêm bài kiểm thử (unit/integration) cho logic chọn shape. Tôi đã cập nhật file này sang tiếng Việt trong repository.
