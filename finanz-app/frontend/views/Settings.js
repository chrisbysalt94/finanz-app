const SettingsView = {
  props: ['data'],
  emits: ['refresh'],
  setup(props, { emit }) {
    const { ref, computed } = Vue;

    const toast = ref('');
    const editingItem = ref(null);
    const showSecondJob = ref(false);
    const searchQuery = ref('');
    const addingItem = ref(false);
    const newItem = ref(null);

    const persons = computed(() => props.data?.persons || []);

    // Parse target_account into a display-friendly account name
    function getAccountGroup(target) {
      if (!target) return { key: '_none', label: 'Persönlich / Kein Konto', icon: '\u{1F464}' };
      const dest = target.trim();
      // Parse "Zusammen -> Revolut Wohnung" or "Getrennt -> Altersvorsorge"
      const arrow = dest.indexOf('->');
      let accountPart = arrow >= 0 ? dest.substring(arrow + 2).trim() : dest;
      const transferType = arrow >= 0 ? dest.substring(0, arrow).trim() : '';

      // Normalize Revolute -> Revolut
      accountPart = accountPart.replace(/^Revolute?\s*/i, 'Revolut ').replace(/^Revolut\s*$/, 'Revolut').trim();

      const icon = accountPart.toLowerCase().startsWith('revolut') ? '\u{1F4B3}'
        : accountPart.toLowerCase().startsWith('traderepublic') ? '\u{1F4C8}'
        : accountPart.toLowerCase().includes('mvb') || accountPart.toLowerCase().includes('barclay') ? '\u{1F3E6}'
        : '\u{1F3E6}';

      const prefix = transferType ? (transferType + ' → ') : '';
      return { key: accountPart, label: prefix + accountPart, icon };
    }

    const budgetItems = computed(() => {
      if (!props.data) return [];
      const { items } = props.data;
      const query = searchQuery.value.toLowerCase().trim();

      const groups = {};
      // Define a sort order for account groups
      const accountOrder = ['Revolut Wohnung', 'Revolut', 'Revolut Haushalt', 'Revolut Geschenke',
        'Revolut Health', 'Revolut Verträge', 'Revolut Auto', 'Revolut Tanken',
        'TradeRepublic', 'MVB + Barclay', '_none'];

      for (const item of items) {
        if ((item.section || 'fixed') === 'income') continue;

        // Filter by search query
        if (query) {
          const matches =
            (item.category_name || '').toLowerCase().includes(query) ||
            (item.notes || '').toLowerCase().includes(query) ||
            (item.target_account || '').toLowerCase().includes(query);
          if (!matches) continue;
        }

        const acc = getAccountGroup(item.target_account);
        if (!groups[acc.key]) {
          groups[acc.key] = { label: acc.label, icon: acc.icon, items: [], total: 0 };
        }
        groups[acc.key].items.push(item);
        groups[acc.key].total += item.amount_total || 0;
      }

      // Sort groups by predefined order, unknowns at end
      return Object.entries(groups)
        .sort(([a], [b]) => {
          const ai = accountOrder.indexOf(a);
          const bi = accountOrder.indexOf(b);
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        })
        .filter(([key, val]) => val.items.length > 0)
        .map(([key, val]) => ({
          key, label: val.label, icon: val.icon, items: val.items,
          total: Math.round(val.total * 100) / 100,
        }));
    });

    // Live preview for edit modal — includes Spaßgeld impact per person
    const editPreview = computed(() => {
      if (!editingItem.value || !props.data) return null;
      const item = editingItem.value;
      const { persons: ps, totalIncome, items } = props.data;

      let effectiveTotal = parseFloat(item.amount_total) || 0;
      if (item.amount_type === 'percent' && item.amount_percent != null) {
        effectiveTotal = Math.round(totalIncome * (parseFloat(item.amount_percent) || 0) / 100 * 100) / 100;
      }

      const splits = {};
      for (const p of ps) {
        if (item.split_type === 'custom' && item._customParsed) {
          const pct = item._customParsed[p.name] || 0;
          splits[p.name] = Math.round(effectiveTotal * pct / 100 * 100) / 100;
        } else {
          const personIncome = p.net_income + (p.second_income || 0);
          const ratio = totalIncome > 0 ? personIncome / totalIncome : 0;
          splits[p.name] = Math.round(effectiveTotal * ratio * 100) / 100;
        }
      }

      // Calculate Spaßgeld impact: difference between new and old splits
      const funImpact = {};
      const originalItem = items.find(i => i.id === item.id);
      for (const p of ps) {
        const oldSplit = originalItem?.splits?.[p.name] || 0;
        const newSplit = splits[p.name] || 0;
        funImpact[p.name] = Math.round((oldSplit - newSplit) * 100) / 100; // positive = more fun money
      }

      const pctOfIncome = totalIncome > 0 ? (effectiveTotal / totalIncome * 100).toFixed(1) : '0.0';
      return { effectiveTotal, splits, pctOfIncome, funImpact };
    });

    // Live preview for add modal
    const addPreview = computed(() => {
      if (!newItem.value || !props.data) return null;
      const item = newItem.value;
      const { persons: ps, totalIncome } = props.data;

      let effectiveTotal = parseFloat(item.amount_total) || 0;
      if (item.amount_type === 'percent' && item.amount_percent != null) {
        effectiveTotal = Math.round(totalIncome * (parseFloat(item.amount_percent) || 0) / 100 * 100) / 100;
      }

      const splits = {};
      const funImpact = {};
      for (const p of ps) {
        if (item.split_type === 'custom' && item._customParsed) {
          const pct = item._customParsed[p.name] || 0;
          splits[p.name] = Math.round(effectiveTotal * pct / 100 * 100) / 100;
        } else {
          const personIncome = p.net_income + (p.second_income || 0);
          const ratio = totalIncome > 0 ? personIncome / totalIncome : 0;
          splits[p.name] = Math.round(effectiveTotal * ratio * 100) / 100;
        }
        funImpact[p.name] = -splits[p.name]; // new item = always reduces fun money
      }

      const pctOfIncome = totalIncome > 0 ? (effectiveTotal / totalIncome * 100).toFixed(1) : '0.0';
      return { effectiveTotal, splits, pctOfIncome, funImpact };
    });

    async function updateIncome(personId, value) {
      await fetch(`api/persons/${personId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ net_income: parseFloat(value) || 0 }),
      });
      showToast('Gespeichert');
      emit('refresh');
    }

    async function updateSecondIncome(personId, value) {
      await fetch(`api/persons/${personId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ second_income: parseFloat(value) || 0 }),
      });
      showToast('Gespeichert');
      emit('refresh');
    }

    async function updateInvestment(personId, value) {
      await fetch(`api/persons/${personId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invest_amount: parseFloat(value) || 0 }),
      });
      showToast('Gespeichert');
      emit('refresh');
    }

    async function updateSavings(personId, value) {
      await fetch(`api/persons/${personId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ savings_amount: parseFloat(value) || 0 }),
      });
      showToast('Gespeichert');
      emit('refresh');
    }

    // Live fun money preview (Spaßgeld per person)
    const funMoneyPreview = computed(() => {
      if (!props.data) return null;
      const { persons: ps, totalIncome, items } = props.data;

      const personExpenses = {};
      const deductionItems = {};
      const spastItems = {};
      const spastTotals = {};
      for (const p of ps) {
        personExpenses[p.name] = 0;
        deductionItems[p.name] = [];
        spastItems[p.name] = [];
      }
      for (const item of items) {
        if (item.section === 'income') continue;
        const target = (item.target_account || '').toLowerCase().trim();
        const isSpastkonto = target.includes('spast');
        const isNoAccount = !target;
        for (const p of ps) {
          const amount = item.splits[p.name] || 0;
          personExpenses[p.name] += amount;
          if (amount > 0) {
            if (isSpastkonto) {
              spastItems[p.name].push({ name: item.category_name, amount });
            } else if (isNoAccount) {
              deductionItems[p.name].push({ name: item.category_name, amount });
            }
          }
        }
      }

      // Fun money brutto (before Spastkonto) and netto (after)
      const funMoney = {};
      const funMoneyNet = {};
      for (const p of ps) {
        spastTotals[p.name] = spastItems[p.name].reduce((s, d) => s + d.amount, 0);
        const totalSalary = p.net_income + (p.second_income || 0);
        const expWithoutSpast = personExpenses[p.name] - spastTotals[p.name];
        funMoney[p.name] = Math.round((totalSalary - (p.invest_amount || 0) - (p.savings_amount || 0) - expWithoutSpast) * 100) / 100;
        funMoneyNet[p.name] = Math.round((funMoney[p.name] - spastTotals[p.name]) * 100) / 100;
      }
      const totalFunNet = Math.round(Object.values(funMoneyNet).reduce((a, b) => a + b, 0) * 100) / 100;

      return { funMoney, funMoneyNet, totalFunNet, deductionItems, spastItems };
    });

    function suggestedInvest(person) {
      return Math.round(person.net_income * 0.3 * 100) / 100;
    }

    function investPct(person) {
      return person.net_income > 0 ? ((person.invest_amount || 0) / person.net_income * 100).toFixed(1) : '0.0';
    }

    function openEdit(item) {
      editingItem.value = { ...item };
      if (!editingItem.value.amount_type) editingItem.value.amount_type = 'fixed';
      if (editingItem.value.split_type === 'custom' && editingItem.value.split_custom) {
        try {
          editingItem.value._customParsed = JSON.parse(editingItem.value.split_custom);
        } catch {
          editingItem.value._customParsed = {};
        }
      } else {
        editingItem.value._customParsed = {};
      }
    }

    async function saveEdit() {
      const item = editingItem.value;
      if (item.split_type === 'custom') {
        item.split_custom = JSON.stringify(item._customParsed);
      } else {
        item.split_custom = null;
      }
      await fetch(`api/budget/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount_total: item.amount_type === 'percent' ? 0 : (parseFloat(item.amount_total) || 0),
          split_type: item.split_type,
          split_custom: item.split_custom,
          target_account: item.target_account,
          notes: item.notes,
          amount_type: item.amount_type || 'fixed',
          amount_percent: item.amount_type === 'percent' ? (parseFloat(item.amount_percent) || 0) : null,
        }),
      });
      showToast('Gespeichert');
      emit('refresh');
      editingItem.value = null;
    }

    function openAdd(accountKey) {
      const customParsed = {};
      if (props.data?.persons) {
        for (const p of props.data.persons) {
          customParsed[p.name] = 50;
        }
      }
      // Try to guess a default target_account from the account group
      let defaultTarget = '';
      if (accountKey !== '_none') {
        // Find an existing item in this group to copy its target_account format
        const existing = props.data?.items?.find(i => {
          const acc = getAccountGroup(i.target_account);
          return acc.key === accountKey;
        });
        defaultTarget = existing?.target_account || '';
      }
      newItem.value = {
        category_name: '',
        amount_total: 0,
        amount_type: 'fixed',
        amount_percent: null,
        split_type: 'proportional',
        _customParsed: customParsed,
        target_account: defaultTarget,
        notes: '',
        section: 'fixed', // default section for new items
      };
      addingItem.value = true;
    }

    async function saveNewItem() {
      const item = newItem.value;
      if (!item.category_name.trim()) {
        showToast('Bitte Name eingeben');
        return;
      }

      // Find parent category for this section
      const parentCat = props.data.categories.find(
        c => c.section === item.section && c.parent_id === null
      );

      // Create new category
      const catRes = await fetch('api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: item.category_name.trim(),
          parent_id: parentCat?.id || null,
          section: item.section,
          color: parentCat?.color || '#ffffff',
          sort_order: 100,
        }),
      });
      const newCat = await catRes.json();

      let splitCustom = null;
      if (item.split_type === 'custom') {
        splitCustom = JSON.stringify(item._customParsed);
      }

      await fetch('api/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: newCat.id,
          amount_total: item.amount_type === 'percent' ? 0 : (parseFloat(item.amount_total) || 0),
          split_type: item.split_type,
          split_custom: splitCustom,
          target_account: item.target_account || null,
          notes: item.notes || null,
          amount_type: item.amount_type || 'fixed',
          amount_percent: item.amount_type === 'percent' ? (parseFloat(item.amount_percent) || 0) : null,
        }),
      });

      showToast('Hinzugefügt');
      addingItem.value = false;
      newItem.value = null;
      emit('refresh');
    }

    function getFormulaText(item) {
      if (item.split_type === 'custom' && item.split_custom) {
        try {
          const custom = JSON.parse(item.split_custom);
          return Object.entries(custom).map(([k, v]) => `${k}: ${v}%`).join(' \u00B7 ');
        } catch {
          return item.split_custom;
        }
      }
      if (!props.data) return 'Gehaltsabh\u00E4ngig';
      const { persons, totalIncome } = props.data;
      const pcts = persons.map(p => {
        const income = p.net_income + (p.second_income || 0);
        const pct = totalIncome > 0 ? ((income / totalIncome) * 100).toFixed(1) : 0;
        return `${p.name}: ${pct}%`;
      });
      return pcts.join(' \u00B7 ');
    }

    function getSplitLabel(item) {
      return item.split_type === 'custom' ? 'Eigene %' : 'Gehaltsabh.';
    }

    function fmt(n) {
      return parseFloat(n).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
    }

    function showToast(msg) {
      toast.value = msg;
      setTimeout(() => toast.value = '', 2000);
    }

    let debounceTimer = null;
    function debounceIncome(personId, event) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => updateIncome(personId, event.target.value), 800);
    }

    let secondJobTimer = null;
    function debounceSecondIncome(personId, event) {
      clearTimeout(secondJobTimer);
      secondJobTimer = setTimeout(() => updateSecondIncome(personId, event.target.value), 800);
    }

    let investTimer = null;
    function debounceInvest(personId, event) {
      clearTimeout(investTimer);
      investTimer = setTimeout(() => updateInvestment(personId, event.target.value), 800);
    }

    let savingsTimer = null;
    function debounceSavings(personId, event) {
      clearTimeout(savingsTimer);
      savingsTimer = setTimeout(() => updateSavings(personId, event.target.value), 800);
    }

    // Auto-show second job section if any person has second_income > 0
    if (persons.value.some(p => (p.second_income || 0) > 0)) {
      showSecondJob.value = true;
    }

    return {
      persons, budgetItems, toast, editingItem, showSecondJob,
      searchQuery, addingItem, newItem, editPreview, addPreview, funMoneyPreview,
      debounceIncome, debounceSecondIncome, debounceInvest, debounceSavings,
      openEdit, saveEdit, openAdd, saveNewItem,
      getFormulaText, getSplitLabel, getAccountGroup, fmt,
      suggestedInvest, investPct,
    };
  },
  template: `
    <div v-if="!data" style="text-align:center;padding:60px;color:var(--text-muted)">
      <div style="font-size:32px;margin-bottom:8px">\u2699\uFE0F</div>
      Laden...
    </div>
    <div v-else>
      <!-- Income Settings -->
      <div class="settings-section">
        <div class="settings-title">
          <span class="settings-title-icon">\u{1F4B0}</span> Einkommen
        </div>
        <div class="setting-row" v-for="p in persons" :key="p.id">
          <div>
            <div class="setting-label">{{ p.name }}</div>
            <div class="setting-sub">Netto-Gehalt pro Monat</div>
          </div>
          <input class="setting-input" type="number" step="0.01"
                 :value="p.net_income"
                 @input="debounceIncome(p.id, $event)">
        </div>

        <div v-if="!showSecondJob" class="setting-row" style="border:none;padding:8px 16px">
          <button class="btn btn-sm btn-ghost" @click="showSecondJob = true"
                  style="font-size:12px;color:var(--blue)">+ Zweitjob hinzuf\u00FCgen</button>
        </div>

        <template v-if="showSecondJob">
          <div class="setting-row" v-for="p in persons" :key="'sj-'+p.id" style="padding-top:4px;padding-bottom:4px">
            <div>
              <div class="setting-label" style="font-size:13px">{{ p.name }} Zweitjob</div>
              <div class="setting-sub">Optional</div>
            </div>
            <input class="setting-input" type="number" step="0.01"
                   :value="p.second_income || 0"
                   @input="debounceSecondIncome(p.id, $event)">
          </div>
        </template>

        <div class="setting-row" v-if="data.totalIncome > 0" style="border:none;padding-top:12px">
          <div style="display:flex;gap:12px;width:100%">
            <div v-for="p in persons" :key="p.name" style="flex:1">
              <div class="setting-sub" style="margin-bottom:4px">Anteil {{ p.name }}</div>
              <div style="display:flex;align-items:center;gap:8px">
                <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden">
                  <div :style="{
                    width: ((p.net_income + (p.second_income || 0)) / data.totalIncome * 100) + '%',
                    height: '100%',
                    background: p.name === persons[0]?.name ? 'var(--blue)' : 'var(--purple)',
                    borderRadius: '3px'
                  }"></div>
                </div>
                <span style="font-weight:700;font-size:13px">{{ ((p.net_income + (p.second_income || 0)) / data.totalIncome * 100).toFixed(1) }}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Investment Settings -->
      <div class="settings-section">
        <div class="settings-title">
          <span class="settings-title-icon">\u{1F4C8}</span> Investitionen
        </div>
        <div style="padding:0 16px 12px;font-size:12px;color:var(--text-muted)">
          Individuelle Investitionen pro Person. Werden wie andere Posten vom Gehalt abgezogen.
        </div>
        <div class="setting-row" v-for="p in persons" :key="'invest-'+p.id">
          <div style="flex:1;min-width:0">
            <div class="setting-label">{{ p.name }}</div>
            <div class="setting-sub">
              {{ investPct(p) }}% vom Gehalt
            </div>
          </div>
          <input class="setting-input" type="number" step="1"
                 :value="p.invest_amount || 0"
                 @input="debounceInvest(p.id, $event)">
        </div>
      </div>

      <!-- Savings Settings -->
      <div class="settings-section">
        <div class="settings-title">
          <span class="settings-title-icon">\u{1F3AF}</span> Sparen f\u00FCr gro\u00DFe Sachen
        </div>
        <div style="padding:0 16px 12px;font-size:12px;color:var(--text-muted)">
          Individuelle Spar-Betr\u00E4ge pro Person. Jeder entscheidet selbst.
        </div>
        <div class="setting-row" v-for="p in persons" :key="'savings-'+p.id">
          <div style="flex:1;min-width:0">
            <div class="setting-label">{{ p.name }}</div>
            <div class="setting-sub">
              {{ p.net_income > 0 ? ((p.savings_amount || 0) / p.net_income * 100).toFixed(1) : '0.0' }}% vom Gehalt
            </div>
          </div>
          <input class="setting-input" type="number" step="1"
                 :value="p.savings_amount || 0"
                 @input="debounceSavings(p.id, $event)">
        </div>
      </div>

      <!-- Spaßgeld Live Preview (sticky) -->
      <div v-if="funMoneyPreview" style="margin:12px 16px 0;padding:14px 16px;background:linear-gradient(135deg, rgba(52,199,89,0.12), rgba(52,199,89,0.06));border-radius:14px;border:1px solid rgba(52,199,89,0.2)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-size:13px;font-weight:700;color:var(--green)">\u{1F4B0} Spast Geld</span>
          <span style="font-size:15px;font-weight:800;color:var(--green)">{{ fmt(funMoneyPreview.totalFunNet) }}</span>
        </div>
        <div style="display:flex;gap:12px">
          <div v-for="p in persons" :key="'fun-'+p.id" style="flex:1;background:rgba(0,0,0,0.05);border-radius:10px;padding:8px 10px">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:2px">{{ p.name }}</div>
            <div style="font-size:16px;font-weight:800;font-variant-numeric:tabular-nums" :style="{color: funMoneyPreview.funMoneyNet[p.name] >= 0 ? 'var(--green)' : 'var(--red, #ff3b30)'}">{{ fmt(funMoneyPreview.funMoneyNet[p.name]) }}</div>
            <div v-if="funMoneyPreview.deductionItems[p.name]?.length" style="margin-top:4px;border-top:1px solid rgba(0,0,0,0.08);padding-top:4px">
              <div style="font-size:9px;color:var(--text-muted);margin-bottom:2px">Vom Gehalt abgezogen:</div>
              <div v-for="d in funMoneyPreview.deductionItems[p.name]" :key="'fd-'+d.name"
                   style="font-size:10px;display:flex;justify-content:space-between;color:var(--text-muted);padding:1px 0">
                <span>{{ d.name }}</span>
                <span>-{{ fmt(d.amount) }}</span>
              </div>
            </div>
            <div v-if="funMoneyPreview.spastItems[p.name]?.length" style="margin-top:4px;border-top:1px solid rgba(255,59,48,0.15);padding-top:4px">
              <div style="font-size:9px;color:#ff3b30;margin-bottom:2px;font-weight:600">Vom Spast Geld:</div>
              <div v-for="d in funMoneyPreview.spastItems[p.name]" :key="'fs-'+d.name"
                   style="font-size:10px;display:flex;justify-content:space-between;color:#ff3b30;opacity:0.8;padding:1px 0">
                <span>{{ d.name }}</span>
                <span>-{{ fmt(d.amount) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Search -->
      <div style="padding:12px 16px 0">
        <input class="setting-input" style="width:100%;text-align:left;padding:10px 14px;font-size:14px;border-radius:10px"
               type="text" placeholder="\u{1F50D} Kosten suchen..."
               v-model="searchQuery">
      </div>

      <!-- Budget Items by Account -->
      <div class="settings-section" v-for="section in budgetItems" :key="section.key">
        <div class="settings-title" style="display:flex;justify-content:space-between;align-items:center">
          <span><span class="settings-title-icon">{{ section.icon }}</span> {{ section.label }}</span>
          <span style="font-size:13px;font-weight:700;color:var(--text-secondary);font-variant-numeric:tabular-nums">{{ fmt(section.total) }}</span>
        </div>
        <div class="budget-item-edit" v-for="item in section.items" :key="item.id">
          <div class="flex-between">
            <div style="flex:1;min-width:0">
              <div class="budget-item-name">
                {{ item.category_name }}
                <span v-if="item.amount_type === 'percent'"
                      style="font-size:11px;color:var(--purple);font-weight:700;margin-left:4px">
                  ({{ item.amount_percent }}%)
                </span>
              </div>
              <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                <span class="formula-display">{{ getSplitLabel(item) }}: {{ getFormulaText(item) }}</span>
              </div>
              <!-- Per-person splits preview -->
              <div style="display:flex;gap:8px;margin-top:5px;font-size:11px;color:var(--text-muted);flex-wrap:wrap">
                <span v-for="p in data.persons" :key="'split-'+p.name+'-'+item.id"
                      style="font-variant-numeric:tabular-nums">
                  {{ p.name }}: {{ fmt(item.splits[p.name] || 0) }}
                </span>
                <span style="color:var(--text-tertiary)" v-if="data.totalIncome > 0">
                  \u00B7 {{ (item.amount_total / data.totalIncome * 100).toFixed(1) }}%
                </span>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
              <strong style="font-size:15px;font-variant-numeric:tabular-nums">{{ fmt(item.amount_total) }}</strong>
              <button class="btn btn-sm btn-ghost" @click="openEdit(item)">Bearbeiten</button>
            </div>
          </div>
        </div>
        <!-- Add button -->
        <div style="padding:10px 16px;text-align:center">
          <button class="btn btn-sm btn-ghost" style="color:var(--blue);font-size:13px"
                  @click="openAdd(section.key)">+ Neuer Posten</button>
        </div>
      </div>

      <!-- Edit Modal -->
      <div class="modal-backdrop" v-if="editingItem" @click.self="editingItem = null">
        <div class="modal">
          <div class="modal-title">{{ editingItem.category_name }}</div>

          <!-- Amount type toggle -->
          <div class="field-group mb-8">
            <div class="field-label">Betrags-Typ</div>
            <select class="field-select" style="width:100%" v-model="editingItem.amount_type">
              <option value="fixed">Fester Betrag (\u20AC)</option>
              <option value="percent">Prozent vom Einkommen</option>
            </select>
          </div>

          <div class="field-group mb-8" v-if="editingItem.amount_type === 'percent'">
            <div class="field-label">Prozent (vom Einkommen {{ fmt(data.totalIncome) }})</div>
            <input class="setting-input" style="width:100%" type="number" step="0.1"
                   v-model.number="editingItem.amount_percent">
          </div>

          <div class="field-group mb-8" v-else>
            <div class="field-label">Betrag (Gesamt/Monat)</div>
            <input class="setting-input" style="width:100%" type="number" step="0.01"
                   v-model.number="editingItem.amount_total">
          </div>

          <div class="field-group mb-8">
            <div class="field-label">Aufteilung</div>
            <select class="field-select" style="width:100%" v-model="editingItem.split_type">
              <option value="proportional">Gehaltsabh\u00E4ngig (fair nach Einkommen)</option>
              <option value="custom">Eigene Prozente</option>
            </select>
          </div>

          <div v-if="editingItem.split_type === 'custom'" class="mb-8">
            <div class="budget-item-fields">
              <div class="field-group" v-for="p in data.persons" :key="p.name">
                <div class="field-label">{{ p.name }} (%)</div>
                <input class="setting-input" style="width:100%" type="number" step="0.01"
                       v-model.number="editingItem._customParsed[p.name]">
              </div>
            </div>
          </div>

          <div v-if="editingItem.split_type === 'proportional'" class="mb-8"
               style="padding:12px;background:rgba(108,141,255,0.08);border-radius:10px;border:1px solid rgba(108,141,255,0.15)">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">Formel</div>
            <div style="font-family:monospace;font-size:12px;color:var(--accent)">
              Anteil = Gehalt / Gesamteinkommen x Betrag
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:6px" v-if="data">
              Aktuell: {{ data.persons.map(p => p.name + ': ' + ((p.net_income + (p.second_income || 0)) / data.totalIncome * 100).toFixed(1) + '%').join(', ') }}
            </div>
          </div>

          <!-- Live Preview -->
          <div v-if="editPreview" style="padding:12px;background:rgba(52,199,89,0.06);border-radius:10px;border:1px solid rgba(52,199,89,0.15);margin-bottom:12px">
            <div style="font-size:11px;color:var(--green);margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:0.3px">Vorschau</div>
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
              <span style="font-size:13px;font-weight:600">Gesamt/Monat</span>
              <span style="font-size:13px;font-weight:800">{{ fmt(editPreview.effectiveTotal) }}</span>
            </div>
            <div v-for="p in data.persons" :key="'preview-'+p.name"
                 style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary);margin-bottom:2px">
              <span>{{ p.name }}</span>
              <span style="font-weight:600;font-variant-numeric:tabular-nums">{{ fmt(editPreview.splits[p.name]) }}</span>
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:6px;text-align:right">
              {{ editPreview.pctOfIncome }}% vom Einkommen ({{ fmt(data.totalIncome) }})
            </div>
          </div>

          <!-- Spaßgeld Impact -->
          <div v-if="editPreview && editPreview.funImpact" style="padding:10px 12px;background:rgba(255,204,0,0.08);border-radius:10px;border:1px solid rgba(255,204,0,0.2);margin-bottom:12px">
            <div style="font-size:11px;color:#ffcc00;margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:0.3px">\u{1F4B0} Spast Geld Auswirkung</div>
            <div v-for="p in data.persons" :key="'impact-'+p.name"
                 style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:3px">
              <span style="font-weight:600">{{ p.name }}</span>
              <span style="font-weight:800;font-variant-numeric:tabular-nums"
                    :style="{color: editPreview.funImpact[p.name] > 0 ? 'var(--green)' : editPreview.funImpact[p.name] < 0 ? '#ff3b30' : 'var(--text-muted)'}">
                {{ editPreview.funImpact[p.name] > 0 ? '+' : '' }}{{ fmt(editPreview.funImpact[p.name]) }} Spast Geld
              </span>
            </div>
          </div>

          <div class="field-group mb-8">
            <div class="field-label">Zielkonto</div>
            <input class="setting-input" style="width:100%" type="text"
                   v-model="editingItem.target_account"
                   placeholder="z.B. Revolut Urlaub">
          </div>

          <div class="field-group mb-8">
            <div class="field-label">Notizen</div>
            <input class="setting-input" style="width:100%" type="text"
                   v-model="editingItem.notes"
                   placeholder="Notizen...">
          </div>

          <div class="modal-actions">
            <button class="btn btn-ghost" @click="editingItem = null">Abbrechen</button>
            <button class="btn" @click="saveEdit">Speichern</button>
          </div>
        </div>
      </div>

      <!-- Add Item Modal -->
      <div class="modal-backdrop" v-if="addingItem" @click.self="addingItem = false">
        <div class="modal">
          <div class="modal-title">Neuer Budgetposten</div>

          <div class="field-group mb-8">
            <div class="field-label">Name</div>
            <input class="setting-input" style="width:100%;text-align:left" type="text"
                   placeholder="z.B. Urlaub, Streaming..."
                   v-model="newItem.category_name">
          </div>

          <div class="field-group mb-8">
            <div class="field-label">Kategorie</div>
            <select class="field-select" style="width:100%" v-model="newItem.section">
              <option value="deductions">Abz\u00FCge</option>
              <option value="savings">R\u00FCcklagen</option>
              <option value="fixed">Fixkosten</option>
              <option value="auto">Auto</option>
              <option value="contracts">Vertr\u00E4ge</option>
              <option value="housing">Wohnung</option>
              <option value="variable">Variabel</option>
            </select>
          </div>

          <!-- Amount type -->
          <div class="field-group mb-8">
            <div class="field-label">Betrags-Typ</div>
            <select class="field-select" style="width:100%" v-model="newItem.amount_type">
              <option value="fixed">Fester Betrag (\u20AC)</option>
              <option value="percent">Prozent vom Einkommen</option>
            </select>
          </div>

          <div class="field-group mb-8" v-if="newItem.amount_type === 'percent'">
            <div class="field-label">Prozent (vom Einkommen {{ fmt(data.totalIncome) }})</div>
            <input class="setting-input" style="width:100%" type="number" step="0.1"
                   v-model.number="newItem.amount_percent">
          </div>

          <div class="field-group mb-8" v-else>
            <div class="field-label">Betrag (\u20AC/Monat)</div>
            <input class="setting-input" style="width:100%" type="number" step="0.01"
                   v-model.number="newItem.amount_total">
          </div>

          <!-- Split type -->
          <div class="field-group mb-8">
            <div class="field-label">Aufteilung</div>
            <select class="field-select" style="width:100%" v-model="newItem.split_type">
              <option value="proportional">Gehaltsabh\u00E4ngig</option>
              <option value="custom">Eigene Prozente</option>
            </select>
          </div>

          <div v-if="newItem.split_type === 'custom'" class="mb-8">
            <div class="budget-item-fields">
              <div class="field-group" v-for="p in data.persons" :key="'add-custom-'+p.name">
                <div class="field-label">{{ p.name }} (%)</div>
                <input class="setting-input" style="width:100%" type="number" step="0.01"
                       v-model.number="newItem._customParsed[p.name]">
              </div>
            </div>
          </div>

          <!-- Live Preview for add -->
          <div v-if="addPreview" style="padding:12px;background:rgba(52,199,89,0.06);border-radius:10px;border:1px solid rgba(52,199,89,0.15);margin-bottom:12px">
            <div style="font-size:11px;color:var(--green);margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:0.3px">Vorschau</div>
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
              <span style="font-size:13px;font-weight:600">Gesamt/Monat</span>
              <span style="font-size:13px;font-weight:800">{{ fmt(addPreview.effectiveTotal) }}</span>
            </div>
            <div v-for="p in data.persons" :key="'add-preview-'+p.name"
                 style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary);margin-bottom:2px">
              <span>{{ p.name }}</span>
              <span style="font-weight:600;font-variant-numeric:tabular-nums">{{ fmt(addPreview.splits[p.name]) }}</span>
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:6px;text-align:right">
              {{ addPreview.pctOfIncome }}% vom Einkommen ({{ fmt(data.totalIncome) }})
            </div>
          </div>

          <!-- Spaßgeld Impact for add -->
          <div v-if="addPreview && addPreview.funImpact && addPreview.effectiveTotal > 0" style="padding:10px 12px;background:rgba(255,204,0,0.08);border-radius:10px;border:1px solid rgba(255,204,0,0.2);margin-bottom:12px">
            <div style="font-size:11px;color:#ffcc00;margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:0.3px">\u{1F4B0} Spast Geld Auswirkung</div>
            <div v-for="p in data.persons" :key="'add-impact-'+p.name"
                 style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:3px">
              <span style="font-weight:600">{{ p.name }}</span>
              <span style="font-weight:800;font-variant-numeric:tabular-nums;color:#ff3b30">
                {{ fmt(addPreview.funImpact[p.name]) }} Spast Geld
              </span>
            </div>
          </div>

          <!-- Target account -->
          <div class="field-group mb-8">
            <div class="field-label">Zielkonto</div>
            <input class="setting-input" style="width:100%;text-align:left" type="text"
                   v-model="newItem.target_account"
                   placeholder="z.B. Revolut Urlaub">
          </div>

          <!-- Notes -->
          <div class="field-group mb-8">
            <div class="field-label">Notizen</div>
            <input class="setting-input" style="width:100%;text-align:left" type="text"
                   v-model="newItem.notes"
                   placeholder="Notizen...">
          </div>

          <div class="modal-actions">
            <button class="btn btn-ghost" @click="addingItem = false">Abbrechen</button>
            <button class="btn" @click="saveNewItem">Hinzuf\u00FCgen</button>
          </div>
        </div>
      </div>

      <div class="toast" v-if="toast">{{ toast }}</div>
    </div>
  `
};
