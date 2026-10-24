<template>
  <div
    class="fixed bottom-0 left-1/2 z-10 flex w-full -translate-x-1/2 flex-col justify-center gap-2 bg-white/75 pb-8 backdrop-blur-md md:static md:left-auto md:z-0 md:translate-0 md:flex-row md:bg-transparent md:pt-4 md:pb-4 dark:bg-neutral-900/75 dark:md:bg-transparent"
  >
    <div class="flex w-full flex-col gap-4 p-4 md:hidden">
      <UInput
        id="search-restaurant"
        v-model="searchQuery"
        type="text"
        title="Sök på restauranger som ska visas i listan"
        placeholder="Sök restauranger..."
        class="grow"
      />
      <ul class="flex w-full flex-row gap-4">
        <li
          key="filter-week"
          class="flex-1"
        >
          <UButton
            class="w-full justify-center px-2"
            :icon="isAllDaysSelected ? 'i-lucide-x' : 'i-lucide-calendar'"
            color="neutral"
            variant="outline"
            aria-label="Hela veckan"
            @click="toggleAll"
          />
        </li>
        <li
          v-for="day in sweDays"
          :key="day"
          class="flex-1"
        >
          <UButton
            class="w-full justify-center px-2 tracking-wide"
            :label="day.slice(0, 3)"
            color="neutral"
            variant="outline"
            :active="isDaySelected(day)"
            active-color="primary"
            @click="toggleDay(day)"
          />
        </li>
      </ul>
    </div>
    <BaseText
      as="h2"
      class="hidden w-1/3 grow self-center text-left md:block md:w-auto"
    >
      {{ week }}
    </BaseText>
    <ul
      id="day-button-list"
      class="hidden grow-12 items-center justify-center gap-2 md:flex"
    >
      <li key="filter-week">
        <UButton
          :icon="isAllDaysSelected ? 'i-lucide-x' : 'i-lucide-calendar'"
          color="neutral"
          variant="outline"
          aria-label="Hela veckan"
          @click="toggleAll"
        />
      </li>
      <li
        v-for="day in sweDays"
        :key="day"
      >
        <UButton
          :label="day"
          color="neutral"
          variant="outline"
          :aria-pressed="isDaySelected(day)"
          :active="isDaySelected(day)"
          active-color="primary"
          @click="toggleDay(day)"
        />
      </li>
    </ul>
    <UInput
      id="search-restaurant"
      v-model="searchQuery"
      aria-label="Sök"
      type="text"
      title="Sök på restauranger som ska visas i listan"
      placeholder="Sök restauranger..."
      class="hidden self-center text-sm outline-none md:block"
    />
  </div>
</template>

<script lang="ts" setup>
import { storeToRefs } from 'pinia';
import { useFilterStore } from '~/stores/use-filter';
import { sweDays } from '~/types/swedish-days';

const week = ref<string>('v.--');
const filterStore = useFilterStore();
const { isAllDaysSelected } = storeToRefs(filterStore);
const { toggleDay, toggleAll, isDaySelected } = filterStore;
const restaurantsStore = useRestaurantsStore();
const { searchQuery } = storeToRefs(restaurantsStore);

onMounted(() => {
  week.value = `v.${new Date().getWeek()}`;
});
</script>
