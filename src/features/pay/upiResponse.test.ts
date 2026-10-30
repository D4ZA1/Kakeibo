import { expect, test } from '@jest/globals';

import { parseUpiResponse } from './upiResponse';

// ponytail: synthetic samples in the documented format; replace with strings captured in the M5 spike.
test('reads a success response', () => {
  const raw =
    'txnId=AXI123&responseCode=00&Status=SUCCESS&txnRef=ORD-88213&ApprovalRefNo=428100931742';
  expect(parseUpiResponse(raw)).toEqual({
    status: 'SUCCESS',
    txnId: 'AXI123',
    approvalRef: '428100931742',
    responseCode: '00',
    txnRef: 'ORD-88213',
    raw,
  });
});

test('keys are case-insensitive and status is upper-cased', () => {
  expect(parseUpiResponse('TXNID=1&STATUS=failure&approvalrefno=9')).toMatchObject({
    status: 'FAILURE',
    txnId: '1',
    approvalRef: '9',
  });
});

test('SUBMITTED is kept so the caller can send it to Confirm', () => {
  expect(parseUpiResponse('Status=SUBMITTED').status).toBe('SUBMITTED');
});

test.each([[undefined], [null], [''], ['   '], ['Status='], ['Status=PENDING'], ['garbage']])(
  'no usable status in %p → UNKNOWN',
  (raw) => {
    expect(parseUpiResponse(raw).status).toBe('UNKNOWN');
  },
);

test('decodes values, drops "null" and empty fields, survives a bad escape', () => {
  expect(
    parseUpiResponse('Status=SUCCESS&txnRef=A%20B&ApprovalRefNo=null&txnId=&responseCode=5%'),
  ).toMatchObject({
    status: 'SUCCESS',
    txnRef: 'A B',
    approvalRef: undefined,
    txnId: undefined,
    responseCode: '5%',
  });
});

test('a value containing "=" keeps everything after the first one', () => {
  expect(parseUpiResponse('Status=SUCCESS&txnRef=a=b').txnRef).toBe('a=b');
});
