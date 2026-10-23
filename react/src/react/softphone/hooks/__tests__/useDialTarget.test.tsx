import { renderHook, act } from '@testing-library/react';
import { useDialTarget } from '../useDialTarget';
import type { DirectoryContact } from '../../core/view-model';

const support: DirectoryContact = { id: 'support', label: 'Support', destination: '200' };
const helpDesk: DirectoryContact = { id: 'help-desk', label: 'Help desk', destination: '200' };
const alex: DirectoryContact = {
  id: 'alex-rivera',
  label: 'Alex Rivera',
  destination: '+1 (415) 555-0101',
};

describe('useDialTarget', () => {
  it('picks a contact by identity and fills the value cleaned like a paste', () => {
    const { result } = renderHook(() => useDialTarget());
    act(() => result.current.pick(alex));
    expect(result.current.value).toBe('+14155550101');
    expect(result.current.picked).toBe(alex);
  });

  it('marks only the contact that was picked, even when another shares its destination', () => {
    const { result } = renderHook(() => useDialTarget());
    act(() => result.current.pick(helpDesk));
    expect(result.current.picked).toBe(helpDesk);
    expect(result.current.picked).not.toBe(support);
  });

  it('forgets the pick once the user types or pastes', () => {
    const { result } = renderHook(() => useDialTarget());
    act(() => result.current.pick(support));
    act(() => result.current.onType('5559999'));
    expect(result.current.picked).toBeNull();
    expect(result.current.value).toBe('5559999');

    act(() => result.current.pick(support));
    act(() => result.current.onPasteText('(581) 319-5082'));
    expect(result.current.picked).toBeNull();
    expect(result.current.value).toBe('+15813195082');
  });

  it('clears both the value and the pick', () => {
    const { result } = renderHook(() => useDialTarget());
    act(() => result.current.pick(support));
    act(() => result.current.clear());
    expect(result.current.value).toBe('');
    expect(result.current.picked).toBeNull();
  });
});
