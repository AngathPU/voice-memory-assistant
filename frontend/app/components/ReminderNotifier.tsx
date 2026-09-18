'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

interface DueReminder {
  reminder_id: number;
  task: string;
  reminder_time: string;
}

export default function ReminderNotifier() {
  const { token } = useAuth();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  }, []);

  useEffect(() => {
    if (!token) return; // don't poll until logged in

    let cancelled = false;

    const checkDueReminders = async () => {
      try {
        const res = await fetch(`${API_URL}/reminders/due`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const due: DueReminder[] = await res.json();
        if (cancelled || due.length === 0) return;

        for (const reminder of due) {
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('⏰ Voice Memory Reminder', {
              body: reminder.task,
            });
          }

          audioRef.current?.play().catch(() => {});

          await fetch(`${API_URL}/reminders/${reminder.reminder_id}/complete`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          });
        }
      } catch {
        // Silent fail — retried next interval
      }
    };

    checkDueReminders();
    const interval = setInterval(checkDueReminders, 30000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token]);

  return <audio ref={audioRef} src="/alert.mp3" preload="auto" />;
}
