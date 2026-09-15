'use client';

import { useEffect, useRef } from 'react';

// Set this in frontend/.env.local as NEXT_PUBLIC_API_URL=http://172.16.0.2:5000
// (or your deployed backend URL once that's live).
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

interface DueReminder {
  reminder_id: number;
  task: string;
  reminder_time: string;
}

export default function ReminderNotifier() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Ask for notification permission once, on mount.
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const checkDueReminders = async () => {
      try {
        const res = await fetch(`${API_URL}/reminders/due`);
        if (!res.ok) return;
        const due: DueReminder[] = await res.json();
        if (cancelled || due.length === 0) return;

        for (const reminder of due) {
          // Browser notification (requires permission granted above).
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('⏰ Voice Memory Reminder', {
              body: reminder.task,
            });
          }

          // Local audio alert — plays on THIS device, unlike the old
          // server-side sound-play which played on the server's speakers.
          audioRef.current?.play().catch(() => {
            // Autoplay can be blocked until the user interacts with the page
            // at least once — that's expected and not worth surfacing as an error.
          });

          // Tell the backend this reminder has been shown so it won't fire again.
          await fetch(`${API_URL}/reminders/${reminder.reminder_id}/complete`, {
            method: 'POST',
          });
        }
      } catch {
        // Silent fail — a missed poll just gets retried next interval.
      }
    };

    checkDueReminders();
    const interval = setInterval(checkDueReminders, 30000); // poll every 30s

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return <audio ref={audioRef} src="/alert.mp3" preload="auto" />;
}
