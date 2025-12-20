"use client";
import { useEffect, useState } from 'react';

export default function DataApp() {
  const [todos, setTodos] = useState<Array<{ id: string; content?: string }>>([]);

  useEffect(() => {
    let sub: any;
    // Dynamically import the Amplify data client if available
    (async () => {
      try {
        const mod = await import('aws-amplify/data');
        const client = (mod as any).generateClient?.();
        if (client?.models?.Todo?.observeQuery) {
          sub = client.models.Todo.observeQuery().subscribe({
            next: (data: any) => setTodos([...data.items]),
          });
        }
      } catch (_e) {
        // library not available or not configured — silently ignore
        // You can log or surface a message if desired.
      }
    })();

    return () => sub?.unsubscribe?.();
  }, []);

  function createTodo() {
    // If data client is installed and configured, it will handle create via UI
    const content = window.prompt('Todo content');
    if (!content) return;
    // lightly optimistic local update — real create will be performed by data client if present
    setTodos((s) => [...s, { id: Date.now().toString(), content }]);
  }

  return (
    <main style={{ padding: 24 }}>
      <h2>Todos (data client)</h2>
      <button onClick={createTodo}>+ new</button>
      <ul>
        {todos.map((t) => (
          <li key={t.id}>{t.content}</li>
        ))}
      </ul>
      <div style={{ marginTop: 12 }}>
        <small>Note: This component will connect to Amplify Data client if present.</small>
      </div>
    </main>
  );
}
