import { formatValidationError } from '../format-validation-error';

describe('formatValidationError', () => {
  it('formats empty entry_node as start node error', () => {
    expect(formatValidationError("/entry_node: '' does not match pattern '^[a-zA-Z0-9_-]+$'")).toBe(
      'The Start node must be connected to another node'
    );
  });

  it('formats empty nodes array as min nodes error', () => {
    expect(formatValidationError('/nodes: minItems: got 0, want 1')).toBe(
      'The dial plan must have at least one node'
    );
  });

  it('formats missing schedule_id with known message', () => {
    expect(formatValidationError('/nodes/0/config/schedule_id: minLength: got 0, want 1')).toBe(
      'A schedule must be selected in the Schedule node'
    );
  });

  it('formats missing target_id with known message', () => {
    expect(formatValidationError('/nodes/1/config/target_id: minLength: got 0, want 1')).toBe(
      'A target must be selected in the Internal Extension node'
    );
  });

  it('formats unknown config field with node type from payload', () => {
    const nodes = [{ type: 'internal_dial' }];
    expect(formatValidationError('/nodes/0/config/timeout: minimum: got -1, want 0', nodes)).toBe(
      'Invalid timeout in the Internal Extension node'
    );
  });

  it('formats unknown config field with ring_all_users type', () => {
    const nodes = [{ type: 'ring_all_users' }];
    expect(formatValidationError('/nodes/0/config/timeout: minimum: got -1, want 0', nodes)).toBe(
      'Invalid timeout in the Ring All node'
    );
  });

  it('formats unknown config field without payload as generic', () => {
    expect(formatValidationError('/nodes/0/config/timeout: minimum: got -1, want 0')).toBe(
      'Invalid timeout'
    );
  });

  it('replaces underscores with spaces in field names', () => {
    const nodes = [{ type: 'schedule' }];
    expect(formatValidationError('/nodes/0/config/some_field: invalid value', nodes)).toBe(
      'Invalid some field in the Schedule node'
    );
  });

  it('strips JSON path prefix for unknown path patterns', () => {
    expect(formatValidationError('/name: minLength: got 0, want 1')).toBe(
      'minLength: got 0, want 1'
    );
  });

  it('returns raw error when no path prefix', () => {
    expect(formatValidationError('Something went wrong')).toBe('Something went wrong');
  });

  it('handles unknown node type in payload gracefully', () => {
    const nodes = [{ type: 'custom_node' }];
    expect(formatValidationError('/nodes/0/config/value: required', nodes)).toBe(
      'Invalid value in the custom_node node'
    );
  });
});
