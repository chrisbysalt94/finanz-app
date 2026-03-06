const TransfersView = {
  props: ['data'],
  setup(props) {
    const { computed, ref } = Vue;
    const toast = ref('');

    const groupedTransfers = computed(() => {
      if (!props.data?.transfers) return [];
      const groups = {};
      for (const t of props.data.transfers) {
        if (!groups[t.person_name]) groups[t.person_name] = [];
        groups[t.person_name].push(t);
      }
      const colors = ['var(--blue)', 'var(--purple)'];
      let i = 0;
      return Object.entries(groups).map(([name, transfers]) => ({
        name, transfers, color: colors[i++] || colors[0],
        total: transfers.reduce((s, t) => s + t.amount, 0),
      }));
    });

    function fmt(n) {
      return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
    }

    async function copyIban(iban) {
      try {
        await navigator.clipboard.writeText(iban);
        toast.value = 'IBAN kopiert!';
        setTimeout(() => toast.value = '', 2000);
      } catch {}
    }

    return { groupedTransfers, fmt, copyIban, toast };
  },
  template: `
    <div v-if="!data" style="text-align:center;padding:60px;color:var(--text-muted)">
      <div style="font-size:32px;margin-bottom:8px">💸</div>
      Laden...
    </div>
    <div v-else>
      <div class="transfer-card" v-for="group in groupedTransfers" :key="group.name">
        <div class="transfer-person">
          <span class="transfer-person-dot" :style="{ background: group.color }"></span>
          {{ group.name }}
        </div>
        <div class="transfer-row" v-for="t in group.transfers" :key="t.id">
          <div>
            <div class="transfer-target">{{ t.target_account }}</div>
            <div class="transfer-iban" v-if="t.iban" @click="copyIban(t.iban)" title="Klicken zum Kopieren">
              {{ t.iban }}
            </div>
          </div>
          <div class="transfer-amount">{{ fmt(t.amount) }}</div>
        </div>
        <div class="transfer-total">
          <span>Gesamt</span>
          <span>{{ fmt(group.total) }}</span>
        </div>
      </div>
    </div>
    <div class="toast" v-if="toast">{{ toast }}</div>
  `
};
