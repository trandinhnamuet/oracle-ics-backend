import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

/**
 * Translates Postgres data-integrity errors into 4xx responses.
 *
 * Without this, a malformed path parameter reached the driver and the client got
 * a bare 500 "Internal server error": `/subscriptions/not-a-uuid` (22P02),
 * `/users/99999999999999999999` (22003), `/users/abc` (22P02) and an over-long
 * varchar (22001) all behaved that way (QA 2026-09-11, IDOR/uuid-bad,
 * IDOR/user-*, PKG/create-long). Individual routes still declare ParseUUIDPipe /
 * ParseIntPipe where a specific message helps; this filter is the net that keeps
 * any route we missed from answering 500 to what is really a bad request.
 *
 * Only the codes below are mapped. Anything else keeps bubbling up as a 500 so a
 * genuine server-side fault stays visible instead of being disguised as 4xx.
 */
const BAD_REQUEST_CODES = new Set([
  '22P02', // invalid_text_representation — e.g. "abc" for uuid/int
  '22003', // numeric_value_out_of_range — e.g. an id larger than int4/numeric
  '22001', // string_data_right_truncation — value longer than the column
  '22007', // invalid_datetime_format
  '22008', // datetime_field_overflow
  '23503', // foreign_key_violation — points at a row that does not exist
  '23502', // not_null_violation — a required field was not supplied
]);

const MESSAGES: Record<string, string> = {
  '22P02': 'One of the supplied values has an invalid format.',
  '22003': 'One of the supplied numeric values is out of range.',
  '22001': 'One of the supplied values is longer than allowed.',
  '22007': 'One of the supplied dates has an invalid format.',
  '22008': 'One of the supplied dates is out of range.',
  '23503': 'A referenced record does not exist.',
  '23502': 'A required field is missing.',
};

@Catch(QueryFailedError)
export class QueryFailedFilter implements ExceptionFilter {
  private readonly logger = new Logger(QueryFailedFilter.name);

  catch(exception: QueryFailedError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();
    const code = (exception as any)?.driverError?.code ?? (exception as any)?.code;

    if (code === '23505') {
      // unique_violation — the resource already exists
      const conflict = new ConflictException('A record with these values already exists.');
      this.logger.warn(`23505 on ${req?.method} ${req?.url}: ${exception.message}`);
      return res.status(HttpStatus.CONFLICT).json(conflict.getResponse());
    }

    if (BAD_REQUEST_CODES.has(code)) {
      this.logger.warn(`${code} on ${req?.method} ${req?.url}: ${exception.message}`);
      return res.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: MESSAGES[code] ?? 'The request contains an invalid value.',
        error: 'Bad Request',
      });
    }

    this.logger.error(`Unmapped database error on ${req?.method} ${req?.url}: ${exception.message}`);
    const fallback = new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(fallback.getResponse());
  }
}
