/**
 * Type-level tests for number porting types.
 * These tests verify that the types compile correctly and
 * match the expected structure from the API.
 */

import type {
  PortOrderAddress,
  PortOrderSubscriber,
  PortCarrier,
  PortRejection,
  PortDocumentMeta,
  PortOrderStatus,
  PortOrderDetails,
  PortOrder,
  CreatePortOrderRequest,
  PortApproval,
  ApprovePortOrderRequest,
  PortableNumber,
  NonPortableNumber,
  PortEligibilityResult,
} from '../types/number-porting';

describe('Number Porting Types', () => {
  describe('PortOrderStatus', () => {
    it('accepts all valid statuses', () => {
      const statuses: PortOrderStatus[] = [
        'draft',
        'approved',
        'submitted',
        'exception',
        'foc',
        'complete',
        'cancelled',
      ];
      expect(statuses).toHaveLength(7);
    });
  });

  describe('PortOrderAddress', () => {
    it('allows full address', () => {
      const addr: PortOrderAddress = {
        house_number: '123',
        street_name: 'Main St',
        line2: 'Suite 200',
        city: 'Anytown',
        state: 'VA',
        zip: '22030',
      };
      expect(addr.house_number).toBe('123');
      expect(addr.line2).toBe('Suite 200');
    });

    it('allows optional line2 to be undefined', () => {
      const addr: PortOrderAddress = {
        house_number: '123',
        street_name: 'Main St',
        city: 'Anytown',
        state: 'VA',
        zip: '22030',
      };
      expect(addr.line2).toBeUndefined();
    });

    it('allows line2 to be null', () => {
      const addr: PortOrderAddress = {
        house_number: '123',
        street_name: 'Main St',
        line2: null,
        city: 'Anytown',
        state: 'VA',
        zip: '22030',
      };
      expect(addr.line2).toBeNull();
    });
  });

  describe('PortOrderSubscriber', () => {
    it('allows full subscriber', () => {
      const sub: PortOrderSubscriber = {
        btn: '+19195551234',
        business_name: 'Doe Enterprises',
        approver_name: 'John Doe',
        account_number: 'ACC-123',
        pin: '1234',
        address: {
          house_number: '123',
          street_name: 'Main St',
          city: 'Anytown',
          state: 'VA',
          zip: '22030',
        },
      };
      expect(sub.btn).toBe('+19195551234');
      expect(sub.account_number).toBe('ACC-123');
      expect(sub.pin).toBe('1234');
    });

    it('allows optional fields to be undefined', () => {
      const sub: PortOrderSubscriber = {
        btn: '+19195551234',
        business_name: 'Doe Enterprises',
        approver_name: 'John Doe',
        address: {
          house_number: '123',
          street_name: 'Main St',
          city: 'Anytown',
          state: 'VA',
          zip: '22030',
        },
      };
      expect(sub.account_number).toBeUndefined();
      expect(sub.pin).toBeUndefined();
    });
  });

  describe('PortCarrier', () => {
    it('allows all optional fields', () => {
      const carrier: PortCarrier = {};
      expect(carrier.name).toBeUndefined();
      expect(carrier.spid).toBeUndefined();
      expect(carrier.port_type).toBeUndefined();
    });

    it('allows full carrier', () => {
      const carrier: PortCarrier = {
        name: 'AT&T',
        spid: '6214',
        port_type: 'automated',
      };
      expect(carrier.name).toBe('AT&T');
    });
  });

  describe('PortRejection', () => {
    it('allows rejection with all fields', () => {
      const rejection: PortRejection = {
        code: 'INVALID_BTN',
        message: 'The billing telephone number does not match records',
      };
      expect(rejection.code).toBe('INVALID_BTN');
    });

    it('allows empty rejection', () => {
      const rejection: PortRejection = {};
      expect(rejection.code).toBeUndefined();
    });
  });

  describe('PortDocumentMeta', () => {
    it('requires all fields', () => {
      const doc: PortDocumentMeta = {
        s3_key: 'port-orders/abc/loa.pdf',
        content_type: 'application/pdf',
        file_size: 102400,
      };
      expect(doc.s3_key).toContain('loa.pdf');
      expect(doc.file_size).toBe(102400);
    });
  });

  describe('PortOrderDetails', () => {
    it('allows full details', () => {
      const details: PortOrderDetails = {
        phone_numbers: ['+19195551234', '+19195555678'],
        subscriber: {
          btn: '+19195551234',
          business_name: 'Doe Enterprises',
          first_name: 'John',
          last_name: 'Doe',
          approver_name: 'John Doe',
          address: {
            house_number: '123',
            street_name: 'Main St',
            city: 'Anytown',
            state: 'VA',
            zip: '22030',
          },
        },
        requested_foc_date: '2026-03-15',
        requested_foc_time: '10:00',
        actual_foc_date: '2026-03-20',
        losing_carrier: { name: 'AT&T', spid: '6214' },
        rejection: null,
        loa: { s3_key: 'key', content_type: 'application/pdf', file_size: 1024 },
        csr: null,
      };
      expect(details.phone_numbers).toHaveLength(2);
      expect(details.subscriber?.approver_name).toBe('John Doe');
    });

    it('allows minimal details', () => {
      const details: PortOrderDetails = {
        phone_numbers: ['+19195551234'],
      };
      expect(details.subscriber).toBeUndefined();
      expect(details.losing_carrier).toBeUndefined();
    });
  });

  describe('PortOrder', () => {
    it('allows full port order', () => {
      const order: PortOrder = {
        id: 'port_01h455vb4pex5vsknk084sn02t',
        status: 'draft',
        details: {
          phone_numbers: ['+19195551234'],
          subscriber: {
            btn: '+19195551234',
            business_name: 'Doe Enterprises',
            first_name: 'John',
            last_name: 'Doe',
            approver_name: 'John Doe',
            address: {
              house_number: '123',
              street_name: 'Main St',
              city: 'Anytown',
              state: 'VA',
              zip: '22030',
            },
          },
          requested_foc_date: '2026-03-15',
        },
        submitted_at: null,
        created_at: '2026-02-13T00:00:00Z',
        updated_at: '2026-02-13T00:00:00Z',
      };
      expect(order.id).toContain('port_');
      expect(order.status).toBe('draft');
      expect(order.submitted_at).toBeNull();
    });
  });

  describe('CreatePortOrderRequest', () => {
    it('requires phone_numbers, subscriber, and requested_foc_date', () => {
      const req: CreatePortOrderRequest = {
        phone_numbers: ['+19195551234'],
        subscriber: {
          btn: '+19195551234',
          business_name: 'Doe Enterprises',
          first_name: 'John',
          last_name: 'Doe',
          approver_name: 'John Doe',
          address: {
            house_number: '123',
            street_name: 'Main St',
            city: 'Anytown',
            state: 'VA',
            zip: '22030',
          },
        },
        requested_foc_date: '2026-03-15',
      };
      expect(req.phone_numbers).toHaveLength(1);
      expect(req.requested_foc_time).toBeUndefined();
    });

    it('allows optional requested_foc_time', () => {
      const req: CreatePortOrderRequest = {
        phone_numbers: ['+19195551234'],
        subscriber: {
          btn: '+19195551234',
          business_name: 'Doe Enterprises',
          first_name: 'John',
          last_name: 'Doe',
          approver_name: 'John Doe',
          address: {
            house_number: '123',
            street_name: 'Main St',
            city: 'Anytown',
            state: 'VA',
            zip: '22030',
          },
        },
        requested_foc_date: '2026-03-15',
        requested_foc_time: '10:00',
      };
      expect(req.requested_foc_time).toBe('10:00');
    });
  });

  describe('PortEligibilityResult', () => {
    it('allows portable numbers', () => {
      const portable: PortableNumber = {
        phone_number: '+19195551234',
        portable: true,
        losing_carrier: 'AT&T',
      };
      expect(portable.portable).toBe(true);
      expect(portable.losing_carrier).toBe('AT&T');
    });

    it('allows portable number without carrier', () => {
      const portable: PortableNumber = {
        phone_number: '+19195551234',
        portable: true,
      };
      expect(portable.losing_carrier).toBeUndefined();
    });

    it('allows non-portable numbers', () => {
      const nonPortable: NonPortableNumber = {
        phone_number: '+18005551234',
        portable: false,
        reason: 'Toll-free numbers are not supported',
      };
      expect(nonPortable.portable).toBe(false);
      expect(nonPortable.reason).toContain('Toll-free');
    });

    it('allows full eligibility result', () => {
      const result: PortEligibilityResult = {
        portable_numbers: [
          { phone_number: '+19195551234', portable: true, losing_carrier: 'AT&T' },
        ],
        non_portable_numbers: [
          { phone_number: '+18005551234', portable: false, reason: 'Toll-free not supported' },
        ],
      };
      expect(result.portable_numbers).toHaveLength(1);
      expect(result.non_portable_numbers).toHaveLength(1);
    });

    it('allows empty results', () => {
      const result: PortEligibilityResult = {
        portable_numbers: [],
        non_portable_numbers: [],
      };
      expect(result.portable_numbers).toHaveLength(0);
      expect(result.non_portable_numbers).toHaveLength(0);
    });
  });

  describe('Type exports from index', () => {
    it('all number porting types can be imported from types/index', async () => {
      const types = await import('../types');
      expect(types).toBeDefined();
    });
  });
});

describe('Number Porting Instance Methods', () => {
  const mockFetch = jest.fn();
  global.fetch = mockFetch;

  let instance: import('../core/instance').DialStackInstanceImplClass;

  beforeEach(async () => {
    mockFetch.mockReset();
    const { DialStackInstanceImplClass } = await import('../core/instance');
    instance = new DialStackInstanceImplClass({
      publishableKey: 'pk_test_xxx',
      fetchClientSecret: async () => 'cs_test_secret',
    });
    // Start session so getClientSecret resolves
    await instance.startSession();
  });

  const mockJsonResponse = (data: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
    blob: async () => new Blob(['%PDF-mock'], { type: 'application/pdf' }),
    headers: new Headers(),
  });

  it('approvePortOrder calls POST /v1/port-orders/:id/approve', async () => {
    const order = {
      id: 'port_abc123',
      status: 'approved',
      details: { phone_numbers: ['+19195551234'] },
    };
    mockFetch.mockResolvedValueOnce(mockJsonResponse(order));

    const result = await instance.approvePortOrder('port_abc123', {
      signature: 'Jane Smith',
      ip: '203.0.113.42',
    });
    expect(result.status).toBe('approved');

    const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    expect(lastCall[0]).toContain('/v1/port-orders/port_abc123/approve');
    expect(lastCall[1]?.method).toBe('POST');
  });

  it('approvePortOrder throws on error response', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ error: 'Port order is not in draft status' }, 409)
    );

    await expect(
      instance.approvePortOrder('port_abc123', { signature: 'Jane Smith', ip: '203.0.113.42' })
    ).rejects.toThrow('Failed to approve port order');
  });

  it('checkPortEligibility calls POST /v1/port-in-eligibility', async () => {
    const eligibilityResult = {
      portable_numbers: [{ phone_number: '+19195551234', portable: true }],
      non_portable_numbers: [],
    };
    mockFetch.mockResolvedValueOnce(mockJsonResponse(eligibilityResult));

    const result = await instance.checkPortEligibility(['+19195551234']);
    expect(result.portable_numbers).toHaveLength(1);

    const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    expect(lastCall[0]).toContain('/v1/port-in-eligibility');
    expect(lastCall[1]?.method).toBe('POST');
  });

  it('createPortOrder calls POST /v1/port-orders', async () => {
    const order = { id: 'port_123', status: 'draft', details: { phone_numbers: ['+19195551234'] } };
    mockFetch.mockResolvedValueOnce(mockJsonResponse(order));

    const result = await instance.createPortOrder({
      phone_numbers: ['+19195551234'],
      subscriber: {
        btn: '+19195551234',
        business_name: 'Doe Enterprises',
        approver_name: 'John Doe',
        address: {
          house_number: '123',
          street_name: 'Main St',
          city: 'Anytown',
          state: 'VA',
          zip: '22030',
        },
      },
      requested_foc_date: '2026-03-15',
    });
    expect(result.id).toBe('port_123');

    const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    expect(lastCall[0]).toContain('/v1/port-orders');
    expect(lastCall[1]?.method).toBe('POST');
  });

  it('getPortOrder calls GET /v1/port-orders/:id', async () => {
    const order = { id: 'port_123', status: 'draft', details: { phone_numbers: ['+19195551234'] } };
    mockFetch.mockResolvedValueOnce(mockJsonResponse(order));

    const result = await instance.getPortOrder('port_123');
    expect(result.id).toBe('port_123');

    const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    expect(lastCall[0]).toContain('/v1/port-orders/port_123');
  });

  it('submitPortOrder calls POST /v1/port-orders/:id/submit', async () => {
    const order = { id: 'port_123', status: 'submitted' };
    mockFetch.mockResolvedValueOnce(mockJsonResponse(order));

    const result = await instance.submitPortOrder('port_123');
    expect(result.status).toBe('submitted');

    const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    expect(lastCall[0]).toContain('/v1/port-orders/port_123/submit');
    expect(lastCall[1]?.method).toBe('POST');
  });

  it('cancelPortOrder calls POST /v1/port-orders/:id/cancel', async () => {
    const order = { id: 'port_123', status: 'cancelled' };
    mockFetch.mockResolvedValueOnce(mockJsonResponse(order));

    const result = await instance.cancelPortOrder('port_123');
    expect(result.status).toBe('cancelled');

    const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    expect(lastCall[0]).toContain('/v1/port-orders/port_123/cancel');
    expect(lastCall[1]?.method).toBe('POST');
  });

  describe('PortApproval', () => {
    it('allows full approval', () => {
      const approval: PortApproval = {
        signature: 'Jane Smith',
        ip: '203.0.113.42',
        timestamp: '2026-02-13T14:00:00Z',
      };
      expect(approval.signature).toBe('Jane Smith');
      expect(approval.ip).toBe('203.0.113.42');
    });
  });

  describe('ApprovePortOrderRequest', () => {
    it('requires signature and ip', () => {
      const req: ApprovePortOrderRequest = {
        signature: 'Jane Smith',
        ip: '203.0.113.42',
      };
      expect(req.signature).toBe('Jane Smith');
      expect(req.ip).toBe('203.0.113.42');
    });
  });
});
