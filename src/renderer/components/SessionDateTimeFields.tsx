import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { dateStr, todayDateStr } from '../utils/format';

interface Props {
  date: string;
  time: string;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
}

export default function SessionDateTimeFields({ date, time, onDateChange, onTimeChange }: Props) {
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date(`${date}T12:00:00`));
  const root = useRef<HTMLDivElement>(null);
  const dateButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const today = todayDateStr();

  function close(restoreFocus = false) {
    if (restoreFocus) dateButton.current?.focus();
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('[aria-pressed="true"], input')?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  // Keep six-week months visible even in a short dashboard window.
  useLayoutEffect(() => {
    if (open && root.current && panel.current) {
      setOffset(Math.max(0, panel.current.offsetHeight + 16 - root.current.getBoundingClientRect().top));
    }
  }, [open, month]);

  function chooseDate(value: string) {
    onDateChange(value);
    close(true);
  }

  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  return (
    <div className="session-date-time" ref={root}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}
      onKeyDown={(event) => {
        if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
      }}>
      <div>
        <label htmlFor="session-date">Date</label>
        <button id="session-date" type="button" className="session-picker-trigger" ref={dateButton}
          aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? 'session-date-panel' : undefined}
          onClick={() => { setMonth(new Date(`${date}T12:00:00`)); setOpen(!open); }}>
          <span>{new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          <CalendarDays size={15} aria-hidden="true" />
        </button>
      </div>
      <div onFocusCapture={() => setOpen(false)}>
        <label id="session-time-label" htmlFor="session-hour">Start time</label>
        <TimeEntry time={time} onChange={onTimeChange} />
      </div>

      {open && (
        <div id="session-date-panel" className="session-picker-panel" ref={panel} style={{ transform: `translateY(${offset}px)` }} role="dialog" aria-label="Choose session date">
          <div className="session-picker-heading">
            <span aria-live="polite">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
            <div className="session-picker-nav">
              <button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={16} /></button>
              <button type="button" aria-label="Next month" disabled={dateStr(new Date(month.getFullYear(), month.getMonth() + 1, 1)) > today}
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={16} /></button>
            </div>
          </div>
          <div className="session-picker-calendar">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => <span className="session-picker-weekday" key={day}>{day}</span>)}
            {Array.from({ length: monthStart.getDay() }, (_, i) => <span key={`empty-${i}`} />)}
            {Array.from({ length: days }, (_, i) => {
              const day = new Date(month.getFullYear(), month.getMonth(), i + 1);
              const value = dateStr(day);
              return <button type="button" key={value} disabled={value > today} aria-pressed={value === date}
                aria-current={value === today ? 'date' : undefined}
                aria-label={day.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                onClick={() => chooseDate(value)}>{i + 1}</button>;
            })}
          </div>
          <div className="session-picker-footer">
            <button type="button" className="btn btn-secondary" onClick={() => chooseDate(dateStr(yesterday))}>Yesterday</button>
            <button type="button" className="btn btn-secondary" onClick={() => chooseDate(today)}>Today</button>
          </div>
        </div>
      )}

    </div>
  );
}

function TimeEntry({ time, onChange }: { time: string; onChange: (time: string) => void }) {
  const [initialHour, initialMinute] = time.split(':').map(Number);
  const [hour, setHour] = useState(String(initialHour % 12 || 12).padStart(2, '0'));
  const [minute, setMinute] = useState(String(initialMinute).padStart(2, '0'));
  const [period, setPeriod] = useState(initialHour < 12 ? 'AM' : 'PM');

  function update(nextHour: string, nextMinute: string, nextPeriod: string) {
    setHour(nextHour);
    setMinute(nextMinute);
    setPeriod(nextPeriod);
    const valid = /^\d{1,2}$/.test(nextHour) && Number(nextHour) >= 1 && Number(nextHour) <= 12
      && /^\d{1,2}$/.test(nextMinute) && Number(nextMinute) <= 59;
    onChange(valid
      ? `${String(Number(nextHour) % 12 + (nextPeriod === 'PM' ? 12 : 0)).padStart(2, '0')}:${nextMinute.padStart(2, '0')}`
      : '');
  }

  return (
    <div id="session-start-time" className="session-time-entry" role="group" aria-labelledby="session-time-label" aria-describedby="session-start-time-help">
      {[
        { label: 'Hour', value: hour, min: 1, max: 12, set: (value: string) => update(value, minute, period) },
        { label: 'Minute', value: minute, min: 0, max: 59, set: (value: string) => update(hour, value, period) },
      ].map((part, index) => (
        <React.Fragment key={part.label}>
          {index === 1 && <span aria-hidden="true">:</span>}
          <input id={index === 0 ? 'session-hour' : 'session-minute'} type="text" inputMode="numeric" maxLength={2}
            aria-label={part.label} value={part.value} placeholder={index === 0 ? 'hh' : 'mm'}
            aria-invalid={!/^\d{1,2}$/.test(part.value) || Number(part.value) < part.min || Number(part.value) > part.max}
            onFocus={event => event.target.select()}
            onChange={event => part.set(event.target.value.replace(/\D/g, ''))}
            onBlur={() => { if (part.value) part.set(part.value.padStart(2, '0')); }}
            onKeyDown={event => {
              if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
              event.preventDefault();
              const current = Number(part.value) || part.min;
              const next = event.key === 'ArrowUp'
                ? (current >= part.max ? part.min : current + 1)
                : (current <= part.min ? part.max : current - 1);
              part.set(String(next).padStart(2, '0'));
            }} />
        </React.Fragment>
      ))}
      <div className="session-period-options" role="group" aria-label="AM or PM">
        {['AM', 'PM'].map(value => <button key={value} type="button" aria-pressed={period === value}
          onClick={() => update(hour, minute, value)}>{value}</button>)}
      </div>
    </div>
  );
}
