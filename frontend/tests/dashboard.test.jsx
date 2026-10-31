import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from '../src/pages/Dashboard.jsx';

vi.mock('../src/services/index.js',()=>({dashboardService:{dashboard:vi.fn(),alerts:vi.fn(),acknowledge:vi.fn()}}));
import {dashboardService} from '../src/services/index.js';
const data={counts:{people:4,dataIssuesOpen:2},accommodation:{metrics:{placed:3,unplaced:1,externalCostINR:100,budgetINR:200,perNight:[]}},schedule:{metrics:{participantClashes:0}},alerts:[]};
beforeEach(()=>{vi.clearAllMocks();dashboardService.dashboard.mockResolvedValue(data);dashboardService.alerts.mockResolvedValue({alerts:[]});dashboardService.acknowledge.mockResolvedValue({});});
describe('Dashboard',()=>{
 it('renders current metrics and last updated time',async()=>{render(<Dashboard/>);expect(await screen.findByText('4',{selector:'strong'})).toBeTruthy();expect(screen.getByText(/Updated/)).toBeTruthy();});
 it('reports unavailable values instead of making up zeroes',async()=>{dashboardService.dashboard.mockResolvedValue({counts:{},alerts:[]});render(<Dashboard/>);expect(await screen.findAllByText('Unavailable')).not.toHaveLength(0);});
 it('shows retry after an error and clears the error after a successful poll',async()=>{dashboardService.dashboard.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(data);render(<Dashboard/>);expect(await screen.findByText(/Metrics unavailable: offline/)).toBeTruthy();fireEvent.click(screen.getByText('Retry'));await waitFor(()=>expect(screen.queryByText(/Metrics unavailable: offline/)).toBeNull());expect(await screen.findByText('4',{selector:'strong'})).toBeTruthy();});
 it('keeps the last snapshot visible on a refresh failure',async()=>{vi.useFakeTimers({shouldAdvanceTime:true});dashboardService.dashboard.mockResolvedValueOnce(data).mockRejectedValueOnce(new Error('offline'));render(<Dashboard/>);expect(await screen.findByText('4',{selector:'strong'})).toBeTruthy();vi.advanceTimersByTime(15000);expect(await screen.findByText(/Metrics unavailable: offline/)).toBeTruthy();expect(screen.getByText('4',{selector:'strong'})).toBeTruthy();vi.useRealTimers();});
 it('keeps metrics available when the alerts section fails, and retries that section independently',async()=>{dashboardService.alerts.mockRejectedValueOnce(new Error('alert endpoint offline')).mockResolvedValue({alerts:[]});render(<Dashboard/>);expect(await screen.findByText('4',{selector:'strong'})).toBeTruthy();expect(await screen.findByText(/Alerts unavailable: alert endpoint offline/)).toBeTruthy();fireEvent.click(screen.getByText('Retry'));await waitFor(()=>expect(screen.queryByText(/Alerts unavailable/)).toBeNull());expect(screen.getByText('4',{selector:'strong'})).toBeTruthy();});
});
