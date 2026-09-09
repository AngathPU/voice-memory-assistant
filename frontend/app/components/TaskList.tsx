"use client";

import { useEffect, useState } from "react";

// NEW: Added reminder_time to our type definition
type Task = {
  id: number;
  task: string;
  timestamp: string;
  reminder_time?: string | null; 
};

export default function TaskList() {
  const [tasks, setTasks] = useState<Task[]>([]);

  const fetchTasks = async () => {
    try {
      const res = await fetch("http://localhost:5000/tasks");
      if (res.ok) {
        const data = await res.json();
        setTasks(data);
      }
    } catch (error) {
      console.error("Failed to fetch tasks", error);
    }
  };

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 3000); 
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full max-w-2xl mt-16 space-y-6">
      <h2 className="text-2xl font-semibold text-gray-200 border-b border-gray-700 pb-2">
        Recent Tasks
      </h2>
      
      {tasks.length === 0 ? (
        <p className="text-gray-500 text-center italic py-8">
          No tasks saved yet. Tap the microphone to add one!
        </p>
      ) : (
        <ul className="space-y-4">
          {tasks.map((t) => (
            <li 
              key={t.id} 
              className="p-5 bg-gray-800 rounded-xl border border-gray-700 shadow-md flex flex-col sm:flex-row sm:justify-between sm:items-start sm:items-center gap-2 hover:border-gray-600 transition-colors"
            >
              <div className="flex flex-col">
                <span className="text-gray-100 text-lg font-medium">{t.task}</span>
                
                {/* NEW: Render a reminder badge if a time was detected! */}
                {t.reminder_time && (
                  <span className="text-sm text-amber-400 flex items-center gap-1 mt-1 font-medium">
                    ⏰ {new Date(t.reminder_time).toLocaleString([], {
                      weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                    })}
                  </span>
                )}
              </div>

              <span className="text-xs text-gray-500 bg-gray-900 px-3 py-1 rounded-full whitespace-nowrap self-start sm:self-auto mt-2 sm:mt-0">
                Created {new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}