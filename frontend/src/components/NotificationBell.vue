<script setup lang="ts">
// Notification bell (`C3-F2`, `T1.4`).
//
// Deliberately not gated on authentication: the server resolves the recipient
// from the JWT or from the guest session cookie (`ADR-10`), so an anonymous
// visitor who placed a basket can also be told that the producer changed their
// offer. Hiding the bell until sign-up would make the guest experience
// second-class for no reason.

import { onMounted, onUnmounted, ref } from "vue";
import {
  fetchNotifications,
  markNotificationRead,
  type Notification,
} from "../api";

const open = ref(false);
const notifications = ref<Notification[]>([]);
const unreadCount = ref(0);
const loading = ref(false);

/** Polling interval. Notifications are written synchronously server-side. */
const REFRESH_MS = 30_000;

let timer: number | undefined;

async function refresh() {
  loading.value = true;

  try {
    const data = await fetchNotifications();
    notifications.value = data.notifications;
    unreadCount.value = data.unreadCount;
  } catch {
    // A bell that cannot refresh must not break the page it sits on.
  } finally {
    loading.value = false;
  }
}

async function toggle() {
  open.value = !open.value;
  if (open.value) await refresh();
}

async function markRead(notification: Notification) {
  if (notification.isRead) return;

  try {
    unreadCount.value = await markNotificationRead(notification.id);
    notifications.value = notifications.value.map((n) =>
      n.id === notification.id ? { ...n, isRead: true } : n
    );
  } catch {
    // Leave the badge as it is; the next refresh will reconcile it.
  }
}

onMounted(() => {
  void refresh();
  timer = window.setInterval(() => void refresh(), REFRESH_MS);
});

onUnmounted(() => {
  if (timer !== undefined) window.clearInterval(timer);
});
</script>

<template>
  <div class="relative">
    <button
      type="button"
      class="relative rounded px-2 py-1 text-sm hover:bg-gray-100"
      :aria-label="`Notifications${unreadCount > 0 ? ` (${unreadCount} non lues)` : ''}`"
      @click="toggle"
    >
      Notifications
      <span
        v-if="unreadCount > 0"
        class="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white"
      >
        {{ unreadCount > 9 ? "9+" : unreadCount }}
      </span>
    </button>

    <div
      v-if="open"
      class="absolute right-0 z-20 mt-1 w-80 rounded border border-gray-300 bg-white p-2 text-sm shadow-lg"
    >
      <p class="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Notifications
      </p>

      <p v-if="loading" class="px-1 py-2 text-gray-500">Chargement…</p>
      <p v-else-if="notifications.length === 0" class="px-1 py-2 text-gray-500">
        Aucune notification pour le moment.
      </p>

      <ul v-else class="max-h-72 divide-y divide-gray-100 overflow-y-auto">
        <li v-for="notification in notifications" :key="notification.id">
          <button
            type="button"
            class="flex w-full flex-col items-start gap-0.5 px-1 py-2 text-left hover:bg-gray-50"
            @click="markRead(notification)"
          >
            <span :class="notification.isRead ? 'text-gray-600' : 'font-semibold text-gray-900'">
              {{ notification.message }}
            </span>
            <span class="text-xs text-gray-400">{{ notification.createdAt }}</span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
