const StandingOrdersView = {
  props: ['data'],
  setup(props) {
    const { computed } = Vue;

    const groupedOrders = computed(() => {
      if (!props.data?.standingOrders) return [];
      const groups = {};
      for (const o of props.data.standingOrders) {
        if (!groups[o.bank]) groups[o.bank] = [];
        groups[o.bank].push(o);
      }
      return Object.entries(groups).map(([bank, orders]) => ({
        bank, orders,
        total: orders.reduce((s, o) => s + o.amount, 0),
      }));
    });

    function fmt(n) {
      return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
    }

    return { groupedOrders, fmt };
  },
  template: `
    <div v-if="!data" style="text-align:center;padding:60px;color:var(--text-muted)">
      <div style="font-size:32px;margin-bottom:8px">🔄</div>
      Laden...
    </div>
    <div v-else>
      <div class="orders-group" v-for="group in groupedOrders" :key="group.bank">
        <div class="orders-bank">
          <span>🏦</span> Daueraufträge {{ group.bank }}
        </div>
        <div class="order-row" v-for="o in group.orders" :key="o.id">
          <span>{{ o.category }}</span>
          <span>{{ fmt(o.amount) }}</span>
        </div>
        <div class="orders-total">
          <span>Gesamt</span>
          <span>{{ fmt(group.total) }}</span>
        </div>
      </div>
    </div>
  `
};
