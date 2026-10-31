import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Staff from '../src/pages/Staff.jsx';

vi.mock('../src/services/index.js', () => ({ staffService: { roster: vi.fn() } }));
import { staffService } from '../src/services/index.js';

describe('Staff shifts', () => {
  beforeEach(() => {
    staffService.roster.mockResolvedValue({
      staff: [{ memberId: 'ST01', name: 'A Demo', role: 'events_team', roleLabel: 'Events Team', shift: '08:00-16:00' }],
      coverage: [{ role: 'events_team', roleLabel: 'Events Team', staffCount: 1, coveredHours: 8, uncoveredHours: [0, 1, 2] }],
    });
  });

  it('shows the roster and role coverage without exposing contact details', async () => {
    render(<Staff/>);
    expect(await screen.findByText('A Demo')).toBeTruthy();
    expect(screen.getByText('08:00-16:00')).toBeTruthy();
    expect(screen.getByText('00:00, 01:00, 02:00')).toBeTruthy();
    expect(screen.queryByText(/phone/i)).toBeNull();
  });
});
