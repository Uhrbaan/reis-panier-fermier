<script setup lang="ts">
import { ref, onMounted } from 'vue';
// 1. Import the child component
import GuestEntry from './components/GuestEntry.vue';

interface Entry {
  id: number;
  name: string;
  message: string;
  created_at: string;
}

const entries = ref<Entry[]>([]);
const name = ref('');
const message = ref('');
const loading = ref(true);

async function fetchEntries() {
  try {
    const res = await fetch('/api/entries');
    entries.value = await res.json();
  } catch (err) {
    console.error('Failed to load guestbook entries:', err);
  } finally {
    loading.value = false;
  }
}

async function submitEntry() {
  if (!name.value.trim() || !message.value.trim()) return;

  try {
    const res = await fetch('/api/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.value, message: message.value }),
    });

    if (res.ok) {
      const newEntry: Entry = await res.json();
      entries.value.unshift(newEntry);
      name.value = '';
      message.value = '';
    }
  } catch (err) {
    console.error('Failed to submit entry:', err);
  }
}

onMounted(() => {
  fetchEntries();
});
</script>

<template>
  <main class="container">
    <h1>📖 Public Guestbook</h1>

    <!-- Form Section -->
    <form @submit.prevent="submitEntry" class="card">
      <h3>Sign the Guestbook</h3>
      
      <div class="field">
        <label for="name">Your Name</label>
        <input id="name" v-model="name" placeholder="e.g. Alice" required />
      </div>

      <div class="field">
        <label for="message">Message</label>
        <textarea id="message" v-model="message" placeholder="Leave a note..." rows="3" required></textarea>
      </div>

      <button type="submit">Sign Guestbook</button>
    </form>

    <hr />

    <!-- Entries List Section -->
    <h2>Recent Messages</h2>
    <div v-if="loading">Loading messages...</div>
    <div v-else-if="entries.length === 0">No messages yet. Be the first to sign!</div>

    <div v-else class="entries-list">
      <!-- 2. Pass data into child component via :entry prop -->
      <GuestEntry 
        v-for="entry in entries" 
        :key="entry.id" 
        :entry="entry" 
      />
    </div>
  </main>
</template>

<style scoped>
.container {
  max-width: 550px;
  margin: 2rem auto;
  font-family: system-ui, sans-serif;
  padding: 0 1rem;
}
.card {
  background: #f9f9f9;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 1.5rem;
}
.field {
  margin-bottom: 1rem;
  display: flex;
  flex-direction: column;
}
label {
  font-weight: bold;
  margin-bottom: 0.3rem;
}
input, textarea {
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-family: inherit;
}
button {
  background: #2b6cb0;
  color: white;
  border: none;
  padding: 0.6rem 1.2rem;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
}
button:hover {
  background: #2c5282;
}
hr {
  margin: 2rem 0;
  border: 0;
  border-top: 1px solid #eee;
}
</style>