import Dictaphone from "./components/Dictaphone";
import TaskList from "./components/TaskList";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center py-16 px-4">
      <div className="max-w-2xl w-full text-center space-y-4">
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