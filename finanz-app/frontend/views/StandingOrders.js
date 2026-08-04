const StandingOrdersView = {
  props: ['data'],
  setup(props) {
    const { computed, ref } = Vue;
    const toast = ref('');
    const expandedOrder = ref(null);

    // Vereint Pocket-Daueraufträge und Bank-Überweisungen pro Person:
    // Gehalt + Spaßgeld bleiben auf dem eigenen Revolut, die Pockets liegen
    // auf dem gemeinsamen Konto (scope "getrennt" = eigenes Pocket),
    // dazu kommt die Überweisung ans eigene TradeRepublic-Depot.
    const groupedOrders = computed(() => {
      if (!props.data) return [];
      const groups = {};
      const colors = ['var(--blue)', 'var(--purple)'];

      function groupFor(name) {
        if (!groups[name]) {
          groups[name] = {
            name,
            color: colors[Object.keys(groups).length] || colors[0],
            orders: [],
            banks: [],
          };
        }
        return groups[name];
      }

      for (const o of props.data.standingOrders || []) {
        groupFor(o.person_name).orders.push(o);
      }
      for (const t of props.data.transfers || []) {
        groupFor(t.person_name).banks.push(t);
      }

      return Object.values(groups).map(g => ({
        ...g,
        total: g.orders.reduce((s, o) => s + o.amount, 0)
             + g.banks.reduce((s, t) => s + t.amount, 0),
      }));
    });

    const jointIban = computed(() => props.data?.jointRevolutIban || null);

    const unplanned = computed(() => props.data?.unplanned || []);
    const unplannedTotal = computed(() =>
      unplanned.value.reduce((s, u) => s + u.amount_total, 0));

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

    function toggleBreakdown(personName, key) {
      const id = personName + ':' + key;
      expandedOrder.value = expandedOrder.value === id ? null : id;
    }

    function isExpanded(personName, key) {
      return expandedOrder.value === personName + ':' + key;
    }

    return {
      groupedOrders, jointIban, unplanned, unplannedTotal,
      fmt, copyIban, toast, toggleBreakdown, isExpanded,
    };
  },
  template: `
    <div v-if="!data" style="text-align:center;padding:60px;color:var(--text-muted)">
      <div style="font-size:32px;margin-bottom:8px">🔄</div>
      Laden...
    </div>
    <div v-else>
      <!-- Info: neues Konto-Modell -->
      <div style="padding:12px 16px;margin-bottom:12px;font-size:12px;color:var(--text-muted);background:rgba(0,122,255,0.05);border-radius:10px;border:1px solid rgba(0,122,255,0.12)">
        Gehalt & Spaßgeld bleiben auf dem eigenen Revolut. Jede Person überweist
        ihren Anteil per Dauerauftrag auf die Pockets des gemeinsamen Kontos.
        <div v-if="jointIban" style="margin-top:6px;font-family:monospace;font-size:12px;color:var(--text-secondary);cursor:pointer"
             @click="copyIban(jointIban, $event)" title="Klicken zum Kopieren">
          Gemeinsames Konto: {{ jointIban }}
        </div>
      </div>

      <div class="orders-group" v-for="group in groupedOrders" :key="group.name">
        <div class="orders-bank">
          <span class="transfer-person-dot" :style="{ background: group.color }"></span>
          {{ group.name }}
        </div>

        <!-- Pocket-Daueraufträge -->
        <div v-for="o in group.orders" :key="'p-'+o.pocket">
          <div class="order-row" @click="toggleBreakdown(group.name, o.pocket)"
               style="cursor:pointer;transition:background 0.15s"
               :style="isExpanded(group.name, o.pocket) ? 'background:rgba(0,122,255,0.04)' : ''">
            <span style="display:flex;align-items:center;gap:6px">
              <span style="font-size:10px;transition:transform 0.2s;display:inline-block"
                    :style="isExpanded(group.name, o.pocket) ? 'transform:rotate(90deg)' : ''">
                &#9654;
              </span>
              {{ o.pocket }}
              <span v-if="o.scope === 'getrennt'"
                    style="font-size:10px;color:var(--text-muted);font-weight:400;border:1px solid var(--border);border-radius:6px;padding:1px 6px">
                eigenes Pocket
              </span>
              <span v-if="o.breakdown && o.breakdown.length > 1"
                    style="font-size:10px;color:var(--text-muted);font-weight:400">
                ({{ o.breakdown.length }} Posten)
              </span>
            </span>
            <span>{{ fmt(o.amount) }}</span>
          </div>
          <div v-if="isExpanded(group.name, o.pocket) && o.breakdown && o.breakdown.length"
               style="padding:0 16px 12px 32px;background:rgba(0,122,255,0.02)">
            <div v-for="(b, idx) in o.breakdown" :key="idx"
                 style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;border-bottom:1px solid var(--border)">
              <span style="color:var(--text-secondary)">{{ b.category }}</span>
              <span style="font-weight:600;font-variant-numeric:tabular-nums;color:var(--text-primary)">{{ fmt(b.amount) }}</span>
            </div>
          </div>
        </div>

        <!-- Bank-Überweisungen (TradeRepublic etc.) -->
        <div v-for="t in group.banks" :key="'b-'+t.target_account">
          <div class="order-row" @click="toggleBreakdown(group.name, t.target_account)"
               style="cursor:pointer;transition:background 0.15s"
               :style="isExpanded(group.name, t.target_account) ? 'background:rgba(0,122,255,0.04)' : ''">
            <span style="display:flex;align-items:center;gap:6px;min-width:0">
              <span style="font-size:10px;transition:transform 0.2s;display:inline-block"
                    :style="isExpanded(group.name, t.target_account) ? 'transform:rotate(90deg)' : ''">
                &#9654;
              </span>
              <span>
                {{ t.target_account }}
                <span style="font-size:10px;color:var(--text-muted);font-weight:400;border:1px solid var(--border);border-radius:6px;padding:1px 6px;margin-left:4px">
                  eigenes Konto
                </span>
                <span v-if="t.iban" class="transfer-iban" style="display:block;margin-top:2px"
                      @click="copyIban(t.iban, $event)" title="Klicken zum Kopieren">
                  {{ t.iban }}
                </span>
              </span>
            </span>
            <span>{{ fmt(t.amount) }}</span>
          </div>
          <div v-if="isExpanded(group.name, t.target_account) && t.breakdown && t.breakdown.length"
               style="padding:0 16px 12px 32px;background:rgba(0,122,255,0.02)">
            <div v-for="(b, idx) in t.breakdown" :key="idx"
                 style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;border-bottom:1px solid var(--border)">
              <span style="color:var(--text-secondary)">{{ b.category }}</span>
              <span style="font-weight:600;font-variant-numeric:tabular-nums;color:var(--text-primary)">{{ fmt(b.amount) }}</span>
            </div>
          </div>
        </div>

        <div class="orders-total">
          <span>Gesamt {{ group.name }}</span>
          <span>{{ fmt(group.total) }}</span>
        </div>
      </div>

      <!-- Nicht verplante Posten -->
      <div v-if="unplanned.length > 0" class="orders-group" style="border-left:3px solid var(--orange)">
        <div class="orders-bank" style="color:var(--orange)">
          <span class="transfer-person-dot" style="background:var(--orange)"></span>
          Nicht verplant
        </div>
        <div style="padding:0 16px 8px;font-size:12px;color:var(--text-muted)">
          Diese Posten haben kein Zielkonto und werden nirgendwohin überwiesen.
        </div>
        <div class="order-row" v-for="u in unplanned" :key="u.category">
          <span style="min-width:0">
            {{ u.category }}
            <span style="display:block;font-size:11px;color:var(--text-muted);margin-top:2px;font-weight:400">
              <span v-for="(amount, name) in u.splits" :key="name" style="margin-right:8px">
                {{ name }}: {{ fmt(amount) }}
              </span>
            </span>
          </span>
          <span style="color:var(--orange)">{{ fmt(u.amount_total) }}</span>
        </div>
        <div class="orders-total" style="color:var(--orange)">
          <span>Gesamt nicht verplant</span>
          <span>{{ fmt(unplannedTotal) }}</span>
        </div>
      </div>
    </div>
    <div class="toast" v-if="toast">{{ toast }}</div>
  `
};
