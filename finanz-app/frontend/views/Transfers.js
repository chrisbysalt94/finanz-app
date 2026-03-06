const TransfersView = {
  props: ['data'],
  setup(props) {
    const { computed, ref } = Vue;
    const toast = ref('');
    const expandedTransfer = ref(null);

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

    const unplanned = computed(() => {
      if (!props.data?.unplanned) return [];
      return props.data.unplanned;
    });

    const unplannedTotal = computed(() => {
      return unplanned.value.reduce((s, u) => s + u.amount_total, 0);
    });

    function fmt(n) {
      return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
    }

    async function copyIban(iban, event) {
      event.stopPropagation();
      try {
        await navigator.clipboard.writeText(iban);
        toast.value = 'IBAN kopiert!';
        setTimeout(() => toast.value = '', 2000);
      } catch {}
    }

    function toggleBreakdown(personName, bank) {
      const key = personName + ':' + bank;
      expandedTransfer.value = expandedTransfer.value === key ? null : key;
    }

    function isExpanded(personName, bank) {
      return expandedTransfer.value === personName + ':' + bank;
    }

    return { groupedTransfers, unplanned, unplannedTotal, fmt, copyIban, toast, toggleBreakdown, isExpanded };
  },
  template: `
    <div v-if="!data" style="text-align:center;padding:60px;color:var(--text-muted)">
      <div style="font-size:32px;margin-bottom:8px">\u{1F4B8}</div>
      Laden...
    </div>
    <div v-else>
      <div class="transfer-card" v-for="group in groupedTransfers" :key="group.name">
        <div class="transfer-person">
          <span class="transfer-person-dot" :style="{ background: group.color }"></span>
          {{ group.name }}
        </div>
        <div v-for="t in group.transfers" :key="t.target_account">
          <div class="transfer-row" @click="toggleBreakdown(group.name, t.target_account)"
               style="cursor:pointer;transition:background 0.15s"
               :style="isExpanded(group.name, t.target_account) ? 'background:rgba(0,122,255,0.04)' : ''">
            <div style="flex:1;min-width:0">
              <div class="transfer-target" style="display:flex;align-items:center;gap:6px">
                <span style="font-size:10px;transition:transform 0.2s;display:inline-block"
                      :style="isExpanded(group.name, t.target_account) ? 'transform:rotate(90deg)' : ''">
                  \u25B6
                </span>
                {{ t.target_account }}
                <span v-if="t.breakdown && t.breakdown.length > 1"
                      style="font-size:10px;color:var(--text-muted);font-weight:400">
                  ({{ t.breakdown.length }} Posten)
                </span>
              </div>
              <div class="transfer-iban" v-if="t.iban" @click="copyIban(t.iban, $event)" title="Klicken zum Kopieren">
                {{ t.iban }}
              </div>
            </div>
            <div class="transfer-amount">{{ fmt(t.amount) }}</div>
          </div>
          <!-- Breakdown -->
          <div v-if="isExpanded(group.name, t.target_account) && t.breakdown && t.breakdown.length"
               style="padding:0 16px 12px 32px;background:rgba(0,122,255,0.02)">
            <div v-for="(b, idx) in t.breakdown" :key="idx"
                 style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;border-bottom:1px solid var(--border)">
              <span style="color:var(--text-secondary)">{{ b.category }}</span>
              <span style="font-weight:600;font-variant-numeric:tabular-nums;color:var(--text-primary)">{{ fmt(b.amount) }}</span>
            </div>
          </div>
        </div>
        <div class="transfer-total">
          <span>Gesamt</span>
          <span>{{ fmt(group.total) }}</span>
        </div>
      </div>

      <!-- Unplanned items -->
      <div v-if="unplanned.length > 0" class="transfer-card" style="border-left:3px solid var(--orange)">
        <div class="transfer-person" style="color:var(--orange)">
          <span class="transfer-person-dot" style="background:var(--orange)"></span>
          Nicht verplant
        </div>
        <div style="padding:0 16px 8px;font-size:12px;color:var(--text-muted)">
          Diese Posten haben kein Zielkonto und werden nirgendwohin \u00FCberwiesen.
        </div>
        <div class="transfer-row" v-for="u in unplanned" :key="u.category">
          <div style="flex:1;min-width:0">
            <div class="transfer-target">{{ u.category }}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">
              <span v-for="(amount, name) in u.splits" :key="name" style="margin-right:8px">
                {{ name }}: {{ fmt(amount) }}
              </span>
            </div>
          </div>
          <div class="transfer-amount" style="color:var(--orange)">{{ fmt(u.amount_total) }}</div>
        </div>
        <div class="transfer-total" style="color:var(--orange)">
          <span>Gesamt nicht verplant</span>
          <span>{{ fmt(unplannedTotal) }}</span>
        </div>
      </div>
    </div>
    <div class="toast" v-if="toast">{{ toast }}</div>
  `
};
