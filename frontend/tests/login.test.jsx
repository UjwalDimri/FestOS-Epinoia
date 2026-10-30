import React from 'react';
import {fireEvent,render,screen} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import Login from '../src/pages/Login.jsx';
vi.mock('../src/api.js',()=>({api:vi.fn(),setToken:vi.fn(),DEMO_MODE:true}));
import {api} from '../src/api.js';
describe('demo login',()=>{
 it('starts blank and offers dev quick-fill only in demo mode',()=>{render(<Login onLogin={()=>{}}/>);expect(screen.getByLabelText('Email').value).toBe('');expect(screen.getByLabelText('Password').value).toBe('');expect(screen.getByText('Festival Director')).toBeTruthy();});
 it('creates a demo session without an API call',()=>{const onLogin=vi.fn();render(<Login onLogin={onLogin}/>);fireEvent.click(screen.getByText('Events Team'));fireEvent.submit(screen.getByRole('button',{name:'Sign in'}).closest('form'));expect(onLogin).toHaveBeenCalledWith(expect.objectContaining({role:'events_team'}));expect(api).not.toHaveBeenCalled();});
});
