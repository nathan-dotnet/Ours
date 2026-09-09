import { getGreeting } from '../greeting';

describe('getGreeting', () => {
  it('is Good morning before noon', () => {
    expect(getGreeting(0)).toBe('Good morning');
    expect(getGreeting(11)).toBe('Good morning');
  });

  it('is Good afternoon from noon until 6pm', () => {
    expect(getGreeting(12)).toBe('Good afternoon');
    expect(getGreeting(17)).toBe('Good afternoon');
  });

  it('is Good evening from 6pm onward', () => {
    expect(getGreeting(18)).toBe('Good evening');
    expect(getGreeting(23)).toBe('Good evening');
  });
});
