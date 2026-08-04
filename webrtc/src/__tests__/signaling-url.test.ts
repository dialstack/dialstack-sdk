import { resolveSignalingUrl } from '../phone';

describe('resolveSignalingUrl', () => {
  it('derives the signaling host from a prod apiBaseUrl (api. -> webrtc.)', () => {
    expect(resolveSignalingUrl(undefined, 'https://api.dialstack.ai')).toBe(
      'wss://webrtc.dialstack.ai/v1/webrtc'
    );
  });

  it('derives the signaling host from a dev apiBaseUrl', () => {
    expect(resolveSignalingUrl(undefined, 'https://api.dev.dialstack.ai')).toBe(
      'wss://webrtc.dev.dialstack.ai/v1/webrtc'
    );
  });

  it('honors an explicit signalingBaseUrl over the derived default', () => {
    expect(resolveSignalingUrl('wss://signal.example.com', 'https://api.dialstack.ai')).toBe(
      'wss://signal.example.com/v1/webrtc'
    );
  });

  it('upgrades http(s) to ws(s) on an explicit base', () => {
    expect(resolveSignalingUrl('https://signal.example.com', 'https://api.dialstack.ai')).toBe(
      'wss://signal.example.com/v1/webrtc'
    );
    expect(resolveSignalingUrl('http://localhost:8080', 'https://api.dialstack.ai')).toBe(
      'ws://localhost:8080/v1/webrtc'
    );
  });

  it('does not double-append the /v1/webrtc path or duplicate slashes', () => {
    expect(
      resolveSignalingUrl('wss://signal.example.com/v1/webrtc', 'https://api.dialstack.ai')
    ).toBe('wss://signal.example.com/v1/webrtc');
    expect(resolveSignalingUrl('wss://signal.example.com/', 'https://api.dialstack.ai')).toBe(
      'wss://signal.example.com/v1/webrtc'
    );
  });

  it('leaves a non-api host unchanged when deriving the default (self-host/custom)', () => {
    expect(resolveSignalingUrl(undefined, 'https://gateway.example.com')).toBe(
      'wss://gateway.example.com/v1/webrtc'
    );
  });

  it('falls back to the derived default for an explicit empty string', () => {
    expect(resolveSignalingUrl('', 'https://api.dialstack.ai')).toBe(
      'wss://webrtc.dialstack.ai/v1/webrtc'
    );
  });

  it('normalizes an uppercase scheme on an explicit base', () => {
    expect(resolveSignalingUrl('HTTPS://signal.example.com', 'https://api.dialstack.ai')).toBe(
      'wss://signal.example.com/v1/webrtc'
    );
  });

  it('preserves a path prefix in apiBaseUrl when deriving the default', () => {
    expect(resolveSignalingUrl(undefined, 'https://gateway.example.com/api')).toBe(
      'wss://gateway.example.com/api/v1/webrtc'
    );
  });
});
