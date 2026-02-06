<template>
  <div class="box">
    <div class="sync-pane__header">
      <p class="custom-block-title">Client {{ client.id }}</p>
      <div class="sync-pane__meta">
        <span>Push: {{ lastPush || '—' }}</span>
        <span>Pull: {{ lastPull || '—' }}</span>
        <span
          v-if="client.errors.length"
          class="sync-pane__error"
          :title="client.errors.join('\n')"
          aria-label="Sync errors"
        />
      </div>
    </div>

    <div class="sync-pane__row sync-pane__row--between">
      <label class="sync-pane__toggle">
        <input type="checkbox" v-model="client.offline" />
        <span>Offline</span>
      </label>
      <VPBadge type="info">Pending: {{ client.pending }}</VPBadge>
    </div>

    <div class="sync-pane__row sync-pane__row--input">
      <input
        v-model="client.newTitle"
        @keydown.enter="onAdd"
        type="text"
        placeholder="Add a todo"
      />
      <VPButton theme="alt" text="Add" @click="onAdd" />
    </div>

    <ul class="sync-pane__list" @dragover.self.prevent @drop.self="onDropEnd">
      <li
        v-for="item in client.items"
        :key="item.id"
        class="sync-pane__item"
        draggable="true"
        @dragstart="onDragStart(item.id)"
        @dragover.prevent
        @drop.stop="onDrop(item.id)"
      >
        <input type="checkbox" :checked="item.completed" @change="onToggle(item.id)" />
        <div class="sync-pane__title" @click="onStartEdit(item.id)">
          <template v-if="client.editingId !== item.id">
            <del v-if="item.completed">{{ item.title }}</del>
            <span v-else>{{ item.title }}</span>
          </template>
          <input
            v-else
            v-model="client.editDraft"
            type="text"
            @keydown.enter="onFinishEdit(item.id)"
            @blur="onFinishEdit(item.id)"
          />
        </div>
        <small class="sync-pane__order">order: {{ item.order.toFixed(2) }}</small>
      </li>
    </ul>

    <div v-if="client.conflicts.length" class="custom-block warning">
      <p class="custom-block-title">Conflicts</p>
      <ul>
        <li v-for="(msg, index) in client.conflicts" :key="index">{{ msg }}</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import VPButton from 'vitepress/dist/client/theme-default/components/VPButton.vue'
import VPBadge from 'vitepress/dist/client/theme-default/components/VPBadge.vue'
import type { ClientId } from './useSyncSimulation'
import type { Todo } from './useSyncSimulation'

interface Props {
  client: {
    id: ClientId
    offline: boolean
    newTitle: string
    items: Todo[]
    pending: number
    conflicts: string[]
    errors: string[]
    editingId: string | null
    editDraft: string
  }
  lastPush: string
  lastPull: string
}

defineProps<Props>()

const emit = defineEmits<{
  (e: 'add'): void
  (e: 'toggle', id: string): void
  (e: 'start-edit', id: string): void
  (e: 'finish-edit', id: string): void
  (e: 'drag-start', id: string): void
  (e: 'drop', id: string): void
  (e: 'drop-end'): void
}>()

const onAdd = () => emit('add')
const onToggle = (id: string) => emit('toggle', id)
const onStartEdit = (id: string) => emit('start-edit', id)
const onFinishEdit = (id: string) => emit('finish-edit', id)
const onDragStart = (id: string) => emit('drag-start', id)
const onDrop = (id: string) => emit('drop', id)
const onDropEnd = () => emit('drop-end')
</script>

<style scoped>
.sync-pane__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.sync-pane__row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.sync-pane__row--between {
  justify-content: space-between;
}

.sync-pane__meta {
  font-size: 12px;
  color: var(--vp-c-text-2);
  display: flex;
  gap: 10px;
}

.sync-pane__error {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--vp-c-danger-1);
  display: inline-block;
  align-self: center;
}

.sync-pane__row--input {
  gap: 6px;
}

.sync-pane__row--input input {
  flex: 1;
}

.sync-pane__toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--vp-c-text-2);
  font-size: 13px;
}

.sync-pane__list {
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  max-height: 300px;
  overflow: auto;
  gap: 8px;
}

.sync-pane__item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  align-items: center;
}

.sync-pane__title {
  font-size: 14px;
  color: var(--vp-c-text-1);
  cursor: pointer;
}

.sync-pane__title input {
  width: 100%;
}

.sync-pane__order {
  color: var(--vp-c-text-2);
  font-size: 11px;
}
</style>
