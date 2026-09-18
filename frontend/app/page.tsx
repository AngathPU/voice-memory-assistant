"use client";

import Dictaphone from "./components/Dictaphone";
import TaskList from "./components/TaskList";
import AuthForm from "./components/AuthForm";
import { useAuth } from "./components/AuthContext";

export default function Home() {
  const { token, email, isLoading, logout } = useAuth();

  // Avoid flashing the login form for a split second while we check
  // localStorage for an existing session.
  if (isLoading) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center py-16 px-4">
        <AuthForm />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center py-16 px-4">
      <div className="max-w-2xl w-full text-center space-y-4">
        <div className="flex items-center justify-between text-sm text-gray-400">
          <span>Signed in as {email}</span>
          <button
            onClick={logout}
            className="text-gray-400 hover:text-white underline"
          >
            Log out
          </button>
        </div>

        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          Voice Memory Assistant
        </h1>
        <p className="text-gray-400">
          Press the microphone and speak naturally to save a task or reminder.
        </p>
        
        <Dictaphone />
      </div>

      {/* NEW: The Task List Component */}
      <TaskList />
      
    </main>
  );
}
