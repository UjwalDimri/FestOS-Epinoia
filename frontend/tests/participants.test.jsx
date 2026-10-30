import React from 'react';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import Participants from '../src/pages/Participants.jsx';
vi.mock('../src/services/index.js',()=>({participantsService:{list:vi.fn(),detail:vi.fn(),reveal:vi.fn()}}));
import {participantsService} from '../src/services/index.js';
const list={rows:[{participantId:'P1',name:'Riya',contingentId:'C1',personType:'participant'}],total:1,page:1,limit:25};
beforeEach(()=>{vi.clearAllMocks();participantsService.list.mockResolvedValue(list);participantsService.detail.mockResolvedValue({person:{participantId:'P1',name:'Riya',contingentId:'C1',contactMasked:'••••'},registrations:[],merch:[],duplicateCandidates:[],allocation:null});participantsService.reveal.mockResolvedValue({value:'555-0100'});});
describe('Participants',()=>{
 it('loads rows with a role-correct masking explanation',async()=>{render(<Participants user={{role:'volunteer'}}/>);expect(await screen.findByText('Riya')).toBeTruthy();expect(screen.getByText(/Only participant names, IDs and contingents/)).toBeTruthy();});
 it('debounces search and ignores a canceled stale request',async()=>{render(<Participants user={{role:'hospitality'}}/>);await screen.findByText('Riya');fireEvent.change(screen.getByLabelText('Name search'),{target:{value:'r'}});fireEvent.change(screen.getByLabelText('Name search'),{target:{value:'ri'}});await waitFor(()=>expect(participantsService.list).toHaveBeenCalledTimes(2),{timeout:1000});expect(participantsService.list.mock.calls[1][0]).toContain('q=ri');expect(participantsService.list.mock.calls[1][1]).toBeInstanceOf(AbortSignal);});
 it('requires a reason before making a sensitive reveal request',async()=>{render(<Participants user={{role:'hospitality'}}/>);fireEvent.click(await screen.findByText('Open'));await screen.findByRole('dialog');expect(screen.getByText('Reveal and log').disabled).toBe(true);expect(participantsService.reveal).not.toHaveBeenCalled();fireEvent.change(screen.getByLabelText('Reason (required)'),{target:{value:'Call to verify'} });fireEvent.click(screen.getByText('Reveal and log'));await waitFor(()=>expect(participantsService.reveal).toHaveBeenCalledWith('P1','contact','Call to verify'));expect(await screen.findByText('555-0100')).toBeTruthy();});
 it('surfaces request failures rather than emptying the list',async()=>{participantsService.list.mockRejectedValue(new Error('API unavailable'));render(<Participants user={{role:'hospitality'}}/>);expect(await screen.findByText('API unavailable')).toBeTruthy();});
});
