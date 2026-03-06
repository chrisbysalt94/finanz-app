const SettingsView = {
  props: ['data'],
  emits: ['refresh'],
  setup(props, { emit }) {
    const { ref, computed } = Vue;

    const toast = ref('');
    const editingItem = ref(null);
    const showSecondJob = ref(false);

    const persons = computed(() => props.data?.persons || []);

    const budgetItems = computed(() => {
      if (!props.data) return [];
      const { items } = props.data;

      const sectionLabels = {
        income: 'Einkommen', deductions: 'Abzüge', savings: 'Sparen',
        fixed: 'Fixkosten', auto: 'Auto', contracts: 'Verträge', housing: 'Wohnung',
      };
      const sectionIcons = {
        income: '💰', deductions: '📤', savings: '🏦',
        fixed: '📋', auto: '🚗', contracts: '📝', housing: '🏠',
      };

      const sections = {};
      for (const item of items) {
        const sec = item.section || 'fixed';
        if (sec === 'income') continue; // income is shown separately at the top
        if (!sections[sec]) sections[sec] = { label: sectionLabels[sec] || sec, icon: sectionIcons[sec] || '📁', items: [] };
        sections[sec].items.push(item);
      }

      return Object.entries(sections).map(([key, val]) => ({
        key, label: val.label, icon: val.icon, items: val.items,
      }));
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

    function suggestedInvest(person) {
      return Math.round(person.net_income * 0.3 * 100) / 100;
    }

    function investPct(person) {
      return person.net_income > 0 ? ((person.invest_amount || 0) / person.net_income * 100).toFixed(1) : '0.0';
    }

    async function updateBudgetItem(item) {
      await fetch(`api/budget/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount_total: parseFloat(item.amount_total) || 0,
          split_type: item.split_type,
          split_custom: item.split_custom,
          target_account: item.target_account,
          notes: item.notes,
        }),
      });
      showToast('Gespeichert');
      emit('refresh');
    }

    function openEdit(item) {
      editingItem.value = { ...item };
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
      await updateBudgetItem(item);
      editingItem.value = null;
    }

    function getFormulaText(item) {
      if (item.split_type === 'custom' && item.split_custom) {
        try {
          const custom = JSON.parse(item.split_custom);
          return Object.entries(custom).map(([k, v]) => `${k}: ${v}%`).join(' · ');
        } catch {
          return item.split_custom;
        }
      }
      if (!props.data) return 'Gehaltsabhängig';
      const { persons, adjustedTotal } = props.data;
      const pcts = persons.map(p => {
        const adj = p.net_income - (p.invest_amount || 0);
        const pct = adjustedTotal > 0 ? ((adj / adjustedTotal) * 100).toFixed(1) : 0;
        return `${p.name}: ${pct}%`;
      });
      return pcts.join(' · ');
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

    // Auto-show second job section if any person has second_income > 0
    if (persons.value.some(p => (p.second_income || 0) > 0)) {
      showSecondJob.value = true;
    }

    return {
      persons, budgetItems, toast, editingItem, showSecondJob,
      debounceIncome, debounceSecondIncome, debounceInvest, openEdit, saveEdit,
      getFormulaText, getSplitLabel, fmt,
      suggestedInvest, investPct,
    };
  },
  template: `
    <div v-if="!data" style="text-align:center;padding:60px;color:var(--text-muted)">
      <div style="font-size:32px;margin-bottom:8px">⚙️</div>
      Laden...
    </div>
    <div v-else>
      <!-- Income Settings -->
      <div class="settings-section">
        <div class="settings-title">
          <span class="settings-title-icon">💰</span> Einkommen
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
                  style="font-size:12px;color:var(--blue)">+ Zweitjob hinzufügen</button>
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
          <span class="settings-title-icon">📈</span> Investitionen
        </div>
        <div style="padding:0 16px 12px;font-size:12px;color:var(--text-muted)">
          Investitionen werden vom Gehalt abgezogen, bevor die Aufteilung berechnet wird.
          Wer mehr investiert, wird bei den gemeinsamen Kosten entlastet.
        </div>
        <div class="setting-row" v-for="p in persons" :key="'invest-'+p.id">
          <div style="flex:1;min-width:0">
            <div class="setting-label">{{ p.name }}</div>
            <div class="setting-sub">
              {{ investPct(p) }}% vom Gehalt · Vorschlag (30%): {{ fmt(suggestedInvest(p)) }}
            </div>
            <div class="setting-sub" style="color:var(--text-secondary);margin-top:2px">
              Verfügbar nach Investition: {{ fmt(p.net_income - (p.invest_amount || 0)) }}
            </div>
          </div>
          <input class="setting-input" type="number" step="1"
                 :value="p.invest_amount || 0"
                 @input="debounceInvest(p.id, $event)">
        </div>
        <div class="setting-row" v-if="data.adjustedTotal > 0" style="border:none;padding-top:12px">
          <div style="display:flex;gap:12px;width:100%">
            <div v-for="p in persons" :key="'adj-'+p.name" style="flex:1">
              <div class="setting-sub" style="margin-bottom:4px">Anteil {{ p.name }} (nach Invest)</div>
              <div style="display:flex;align-items:center;gap:8px">
                <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden">
                  <div :style="{
                    width: ((p.net_income - (p.invest_amount || 0)) / data.adjustedTotal * 100) + '%',
                    height: '100%',
                    background: p.name === persons[0]?.name ? 'var(--blue)' : 'var(--purple)',
                    borderRadius: '3px'
                  }"></div>
                </div>
                <span style="font-weight:700;font-size:13px">{{ ((p.net_income - (p.invest_amount || 0)) / data.adjustedTotal * 100).toFixed(1) }}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Budget Items by Section -->
      <div class="settings-section" v-for="section in budgetItems" :key="section.key">
        <div class="settings-title">
          <span class="settings-title-icon">{{ section.icon }}</span> {{ section.label }}
        </div>
        <div class="budget-item-edit" v-for="item in section.items" :key="item.id">
          <div class="flex-between">
            <div style="flex:1;min-width:0">
              <div class="budget-item-name">{{ item.category_name }}</div>
              <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                <span class="formula-display">{{ getSplitLabel(item) }}: {{ getFormulaText(item) }}</span>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
              <strong style="font-size:15px;font-variant-numeric:tabular-nums">{{ fmt(item.amount_total) }}</strong>
              <button class="btn btn-sm btn-ghost" @click="openEdit(item)">Bearbeiten</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Edit Modal -->
      <div class="modal-backdrop" v-if="editingItem" @click.self="editingItem = null">
        <div class="modal">
          <div class="modal-title">{{ editingItem.category_name }}</div>

          <div class="field-group mb-8">
            <div class="field-label">Betrag (Gesamt/Monat)</div>
            <input class="setting-input" style="width:100%" type="number" step="0.01"
                   v-model.number="editingItem.amount_total">
          </div>

          <div class="field-group mb-8">
            <div class="field-label">Aufteilung</div>
            <select class="field-select" style="width:100%" v-model="editingItem.split_type">
              <option value="proportional">Gehaltsabhängig (fair nach Einkommen)</option>
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
              Anteil = (Gehalt - Invest) / Gesamtverfügbar x Betrag
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:6px" v-if="data">
              Aktuell: {{ data.persons.map(p => p.name + ': ' + ((p.net_income - (p.invest_amount || 0)) / data.adjustedTotal * 100).toFixed(1) + '%').join(', ') }}
            </div>
          </div>

          <div class="field-group mb-8">
            <div class="field-label">Zielkonto</div>
            <input class="setting-input" style="width:100%" type="text"
                   v-model="editingItem.target_account"
                   placeholder="z.B. Zusammen -> Revolut">
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

      <div class="toast" v-if="toast">{{ toast }}</div>
    </div>
  `
};
