<script setup lang="ts">
// 1. Define the shape of an entry
interface Entry {
  id: number;
  name: string;
  message: string;
  created_at: string;
}

// 2. Define Props (Data passed IN from parent)
defineProps<{
  entry: Entry;
}>();
</script>

<template>
  <div class="entry-card">
    <div class="entry-header">
      <strong>{{ entry.name }}</strong>
      <small>{{ new Date(entry.created_at).toLocaleString() }}</small>
    </div>
    <p>{{ entry.message }}</p>
  </div>
</template>

<style scoped>
.entry-card {
  border-left: 4px solid #2b6cb0;
  background: #f7fafc;
  padding: 0.8rem 1rem;
  margin-bottom: 1rem;
  border-radius: 0 6px 6px 0;
}
.entry-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.4rem;
  color: #4a5568;
}
p {
  margin: 0;
}
</style>