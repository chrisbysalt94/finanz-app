const { createApp, ref, computed, onMounted } = Vue;

const app = createApp({
  setup() {
    const currentTab = ref('dashboard');
    const budgetData = ref(null);

    const currentView = computed(() => {
      const views = {
        'dashboard': 'dashboard-view',
        'standing-orders': 'standing-orders-view',
        'settings': 'settings-view',
      };
      return views[currentTab.value] || 'dashboard-view';
    });

    async function loadData() {
      try {
        const data = await fetch('api/budget/computed').then(r => r.json());
        budgetData.value = data;
      } catch (err) {
        console.error('Failed to load data:', err);
      }
    }

    onMounted(loadData);

    return { currentTab, currentView, budgetData, loadData };
  }
});

// Register components
app.component('dashboard-view', DashboardView);
app.component('standing-orders-view', StandingOrdersView);
app.component('settings-view', SettingsView);

app.mount('#app');
