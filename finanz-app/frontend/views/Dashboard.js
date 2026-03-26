const DashboardView = {
  props: ['data'],
  setup(props) {
    const { computed, onMounted, watch, nextTick, ref } = Vue;

    const donutCanvas = ref(null);
    const barCanvas = ref(null);
    let donutChart = null;
    let barChart = null;

    // Parse target_account into bank + pocket
    function parseAccount(target) {
      if (!target) return { bank: null, pocket: null, group: null };
      let dest = target.trim();
      const arrow = dest.match(/^(?:Zusammen|Getrennt)\s*->\s*(.+)$/i);
      if (arrow) dest = arrow[1].trim();
      // Normalize Revolute -> Revolut
      dest = dest.replace(/^Revolute\b/i, 'Revolut');

      if (/^Revolut\b/i.test(dest)) {
        const pocket = dest.replace(/^Revolut\s*/i, '').trim() || null;
        // Group by first word of pocket (e.g. "Auto Tanken" -> group "Auto")
        const group = pocket ? pocket.split(/\s+/)[0] : null;
        return { bank: 'Revolut', pocket, group };
      }
      if (/^TradeRepublic/i.test(dest)) return { bank: 'TradeRepublic', pocket: null, group: null };
      if (/spast/i.test(dest)) return { bank: 'Spastkonto', pocket: null, group: null };
      if (/MVB|Barclay/i.test(dest)) return { bank: 'MVB / Barclay', pocket: null, group: null };
      if (arrow) return { bank: 'Getrennt', pocket: dest, group: null };
      return { bank: null, pocket: null, group: null };
    }

    // Account-based sections for budget display
    const accountSections = computed(() => {
      if (!props.data) return [];
      const { items, persons, totalIncome } = props.data;

      const bankOrder = ['Revolut', 'TradeRepublic', 'MVB / Barclay', 'Getrennt', 'Spastkonto', '_none'];
      const bankIcons = {
        'Revolut': '\u{1F4B3}', 'TradeRepublic': '\u{1F4C8}', 'MVB / Barclay': '\u{1F3E6}',
        'Getrennt': '\u{1F465}', 'Spastkonto': '\u{1F4B0}', '_none': '\u{1F464}',
      };
      const bankColors = {
        'Revolut': '#6c8dff', 'TradeRepublic': '#5856d6', 'MVB / Barclay': '#ff9500',
        'Getrennt': '#8e8e93', 'Spastkonto': '#34c759', '_none': '#aeaeb2',
      };

      // Build nested structure: bank -> subgroup -> items
      const banks = {};
      for (const item of items) {
        if (item.section === 'income') continue;
        if (item.amount_total === 0) continue;
        const acc = parseAccount(item.target_account);
        const bankKey = acc.bank || '_none';

        if (!banks[bankKey]) {
          banks[bankKey] = { subgroups: {}, directItems: [], total: 0, splits: {} };
          for (const p of persons) banks[bankKey].splits[p.name] = 0;
        }
        banks[bankKey].total += item.amount_total;
        for (const p of persons) {
          banks[bankKey].splits[p.name] += item.splits[p.name] || 0;
        }

        // Group Revolut items by pocket group
        if (bankKey === 'Revolut' && acc.group) {
          const grpKey = acc.group;
          if (!banks[bankKey].subgroups[grpKey]) {
            banks[bankKey].subgroups[grpKey] = { items: [], total: 0, splits: {} };
            for (const p of persons) banks[bankKey].subgroups[grpKey].splits[p.name] = 0;
          }
          banks[bankKey].subgroups[grpKey].items.push(item);
          banks[bankKey].subgroups[grpKey].total += item.amount_total;
          for (const p of persons) {
            banks[bankKey].subgroups[grpKey].splits[p.name] += item.splits[p.name] || 0;
          }
        } else {
          banks[bankKey].directItems.push(item);
        }
      }

      // Convert to sorted array
      const result = [];
      for (const bankKey of bankOrder) {
        const bank = banks[bankKey];
        if (!bank || bank.total === 0) continue;

        const pct = totalIncome > 0 ? (bank.total / totalIncome * 100).toFixed(1) : '0.0';
        const label = bankKey === '_none' ? 'Pers\u00F6nlich' : bankKey;
        const subgroups = [];

        // Add subgroups (sorted by total desc)
        for (const [grpName, grp] of Object.entries(bank.subgroups).sort((a, b) => b[1].total - a[1].total)) {
          const grpPct = totalIncome > 0 ? (grp.total / totalIncome * 100).toFixed(1) : '0.0';
          // Round splits
          const grpSplits = {};
          for (const p of persons) grpSplits[p.name] = Math.round(grp.splits[p.name] * 100) / 100;
          subgroups.push({
            name: grpName,
            total: Math.round(grp.total * 100) / 100,
            pct: grpPct,
            splits: grpSplits,
            items: grp.items.map(i => ({
              name: i.category_name, amount: i.amount_total,
              splits: i.splits, pct: totalIncome > 0 ? (i.amount_total / totalIncome * 100).toFixed(1) : '0.0',
            })),
          });
        }

        // Round bank splits
        const bankSplits = {};
        for (const p of persons) bankSplits[p.name] = Math.round(bank.splits[p.name] * 100) / 100;

        result.push({
          key: bankKey, label, pct,
          icon: bankIcons[bankKey] || '\u{1F4B3}',
          color: bankColors[bankKey] || '#6c8dff',
          total: Math.round(bank.total * 100) / 100,
          splits: bankSplits,
          subgroups,
          directItems: bank.directItems.map(i => ({
            name: i.category_name, amount: i.amount_total,
            splits: i.splits, pct: totalIncome > 0 ? (i.amount_total / totalIncome * 100).toFixed(1) : '0.0',
          })),
        });
      }

      // Add unknowns (banks not in bankOrder)
      for (const [bankKey, bank] of Object.entries(banks)) {
        if (bankOrder.includes(bankKey) || bank.total === 0) continue;
        const bankSplits = {};
        for (const p of persons) bankSplits[p.name] = Math.round(bank.splits[p.name] * 100) / 100;
        result.push({
          key: bankKey, label: bankKey, pct: totalIncome > 0 ? (bank.total / totalIncome * 100).toFixed(1) : '0.0',
          icon: '\u{1F3E6}', color: '#8e8e93',
          total: Math.round(bank.total * 100) / 100,
          splits: bankSplits, subgroups: [],
          directItems: bank.directItems.map(i => ({
            name: i.category_name, amount: i.amount_total,
            splits: i.splits, pct: totalIncome > 0 ? (i.amount_total / totalIncome * 100).toFixed(1) : '0.0',
          })),
        });
      }

      return result;
    });

    const summaryData = computed(() => {
      if (!props.data) return null;
      const { persons, totalIncome, items } = props.data;

      // Investments per person (displayed like other items)
      const personInvestments = {};
      let totalInvestments = 0;
      for (const p of persons) {
        personInvestments[p.name] = p.invest_amount || 0;
        totalInvestments += p.invest_amount || 0;
      }

      // Savings per person (individual amounts)
      const personSavings = {};
      let totalSavingsAmount = 0;
      for (const p of persons) {
        personSavings[p.name] = p.savings_amount || 0;
        totalSavingsAmount += p.savings_amount || 0;
      }

      let totalExpenses = 0;
      const personExpenses = {};
      for (const p of persons) {
        personExpenses[p.name] = 0;
      }

      // Track items deducted from salary and from Spast Geld separately
      const deductionItems = {};  // deducted from salary (section: deductions)
      const spastItems = {};      // deducted from Spast Geld (target: Spastkonto)
      for (const p of persons) {
        deductionItems[p.name] = [];
        spastItems[p.name] = [];
      }

      for (const item of items) {
        if (item.section === 'income') continue;
        const target = (item.target_account || '').toLowerCase().trim();
        const isSpastkonto = target.includes('spast');
        const isNoAccount = !target; // no target = personal/from salary
        totalExpenses += item.amount_total;
        for (const p of persons) {
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

      // Fun money = total salary - investments - savings - expenses (excl. Spastkonto items)
      // Spastkonto items are shown separately as deductions FROM fun money
      const spastTotals = {};
      for (const p of persons) {
        spastTotals[p.name] = spastItems[p.name].reduce((s, d) => s + d.amount, 0);
      }

      const funMoney = {};       // gross fun money (before Spastkonto deductions)
      const funMoneyNet = {};    // net fun money (after Spastkonto deductions)
      for (const p of persons) {
        const totalSalary = p.net_income + (p.second_income || 0);
        const expensesWithoutSpast = personExpenses[p.name] - spastTotals[p.name];
        funMoney[p.name] = Math.round((totalSalary - (p.invest_amount || 0) - (p.savings_amount || 0) - expensesWithoutSpast) * 100) / 100;
        funMoneyNet[p.name] = Math.round((funMoney[p.name] - spastTotals[p.name]) * 100) / 100;
      }

      const totalFun = Math.round(Object.values(funMoney).reduce((a, b) => a + b, 0) * 100) / 100;
      const totalFunNet = Math.round(Object.values(funMoneyNet).reduce((a, b) => a + b, 0) * 100) / 100;
      totalInvestments = Math.round(totalInvestments * 100) / 100;
      totalSavingsAmount = Math.round(totalSavingsAmount * 100) / 100;
      // True savings = investments + savings + net fun money (money left over after Spast deductions)
      const totalSaved = totalFunNet + totalInvestments + totalSavingsAmount;
      const savingsRate = totalIncome > 0 ? Math.round(totalSaved / totalIncome * 100) : 0;
      const investRate = totalIncome > 0 ? Math.round(totalInvestments / totalIncome * 100) : 0;

      return {
        totalIncome: Math.round(totalIncome * 100) / 100,
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        totalInvestments,
        personInvestments,
        totalSavingsAmount,
        personSavings,
        funMoney,
        funMoneyNet,
        totalFun,
        totalFunNet,
        totalSaved,
        savingsRate,
        investRate,
        persons,
        personExpenses,
        deductionItems,
        spastItems,
      };
    });

    // Insights/Recommendations
    const insights = computed(() => {
      if (!summaryData.value || !accountSections.value.length) return [];
      const tips = [];
      const s = summaryData.value;

      if (s.savingsRate < 10) {
        tips.push({ icon: 'warn', title: 'Niedrige Sparquote', desc: `Eure Sparquote liegt bei ${s.savingsRate}% (inkl. ${fmt(s.totalInvestments)} Investitionen + ${fmt(s.totalSavingsAmount)} Sparen). Ziel: mindestens 20%.` });
      } else if (s.savingsRate >= 20) {
        tips.push({ icon: 'good', title: 'Starke Sparquote!', desc: `${s.savingsRate}% eures Einkommens wird gespart \u2014 davon ${s.investRate}% in Investitionen (${fmt(s.totalInvestments)}/Mo).` });
      } else {
        tips.push({ icon: 'tip', title: 'Sparquote', desc: `${s.savingsRate}% Sparquote (inkl. Investitionen + Sparen). Ziel: 20% f\u00FCr finanzielle Sicherheit.` });
      }

      // Housing ratio from Revolut Wohnung subgroup
      const revolut = accountSections.value.find(s => s.key === 'Revolut');
      const wohnungGrp = revolut?.subgroups.find(g => g.name === 'Wohnung');
      if (wohnungGrp) {
        const housingRatio = Math.round(wohnungGrp.total / s.totalIncome * 100);
        if (housingRatio > 35) {
          tips.push({ icon: 'warn', title: 'Hohe Wohnkosten', desc: `${housingRatio}% des Einkommens gehen f\u00FCr Wohnen drauf. Empfohlen: max. 30-35%.` });
        } else {
          tips.push({ icon: 'good', title: 'Wohnkosten im Rahmen', desc: `${housingRatio}% f\u00FCr Wohnung liegt im empfohlenen Bereich.` });
        }
      }

      const names = Object.keys(s.funMoneyNet);
      if (names.length === 2) {
        const diff = Math.abs(s.funMoneyNet[names[0]] - s.funMoneyNet[names[1]]);
        if (diff < 50) {
          tips.push({ icon: 'good', title: 'Faire Aufteilung', desc: `Nur ${fmt(diff)} Unterschied beim Spast Geld. Das ist ausgewogen!` });
        }
      }

      return tips;
    });

    // Chart data for donut (by account)
    const chartData = computed(() => {
      if (!accountSections.value.length) return null;
      return {
        labels: accountSections.value.map(s => s.label),
        values: accountSections.value.map(s => s.total),
        colors: accountSections.value.map(s => s.color),
      };
    });

    function buildCharts() {
      if (!chartData.value) return;
      const cd = chartData.value;

      // Donut chart
      if (donutCanvas.value) {
        if (donutChart) donutChart.destroy();
        donutChart = new Chart(donutCanvas.value, {
          type: 'doughnut',
          data: {
            labels: cd.labels,
            datasets: [{
              data: cd.values,
              backgroundColor: cd.colors,
              borderWidth: 0,
              hoverOffset: 6,
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: '#1c1c1e',
                titleColor: '#fff',
                bodyColor: '#aeaeb2',
                borderColor: 'transparent',
                borderWidth: 0,
                cornerRadius: 8,
                padding: 10,
                callbacks: {
                  label: (ctx) => ` ${ctx.label}: ${ctx.parsed.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}`,
                },
              },
            },
          },
        });
      }

      // Bar chart - person comparison
      if (barCanvas.value && summaryData.value) {
        if (barChart) barChart.destroy();
        const persons = summaryData.value.persons;
        const pe = summaryData.value.personExpenses;
        const fm = summaryData.value.funMoney;
        barChart = new Chart(barCanvas.value, {
          type: 'bar',
          data: {
            labels: persons.map(p => p.name),
            datasets: [
              {
                label: 'Ausgaben',
                data: persons.map(p => Math.round(pe[p.name] * 100) / 100),
                backgroundColor: 'rgba(255, 59, 48, 0.75)',
                borderRadius: 6,
                borderSkipped: false,
              },
              {
                label: 'Spast Geld',
                data: persons.map(p => Math.round(fm[p.name] * 100) / 100),
                backgroundColor: 'rgba(52, 199, 89, 0.75)',
                borderRadius: 6,
                borderSkipped: false,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: {
                grid: { display: false },
                ticks: { color: '#8e8e93', font: { weight: '600' } },
              },
              y: {
                grid: { color: 'rgba(60, 60, 67, 0.06)' },
                ticks: {
                  color: '#8e8e93',
                  callback: (v) => v.toLocaleString('de-DE') + ' €',
                },
              },
            },
            plugins: {
              legend: {
                labels: {
                  color: '#8e8e93',
                  usePointStyle: true,
                  pointStyle: 'circle',
                  padding: 16,
                  font: { size: 11, weight: '600' },
                },
              },
              tooltip: {
                backgroundColor: '#1c1c1e',
                titleColor: '#fff',
                bodyColor: '#aeaeb2',
                borderColor: 'transparent',
                borderWidth: 0,
                cornerRadius: 8,
                callbacks: {
                  label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}`,
                },
              },
            },
          },
        });
      }
    }

    watch(() => props.data, () => {
      nextTick(() => buildCharts());
    }, { immediate: false });

    onMounted(() => {
      nextTick(() => setTimeout(buildCharts, 100));
    });

    function fmt(n) {
      if (n === 0 || n === undefined) return '0,00 €';
      return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
    }

    return { accountSections, summaryData, insights, fmt, donutCanvas, barCanvas };
  },
  template: `
    <div v-if="!data" style="text-align:center;padding:60px;color:var(--text-muted)">
      <div style="font-size:32px;margin-bottom:8px">📊</div>
      Laden...
    </div>
    <div v-else>
      <!-- Total Income Header -->
      <div v-if="summaryData" style="text-align:center;padding:20px 16px 8px">
        <div style="font-size:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Gesamteinkommen</div>
        <div style="font-size:32px;font-weight:800;letter-spacing:-0.5px">{{ fmt(summaryData.totalIncome) }}</div>
        <div style="font-size:13px;color:var(--text-muted);margin-top:2px">{{ fmt(summaryData.totalIncome * 12) }} / Jahr</div>
      </div>

      <!-- Summary Cards -->
      <div class="summary-cards" v-if="summaryData">
        <div class="summary-card card-chris">
          <div class="summary-card-label">Netto {{ summaryData.persons[0]?.name }}</div>
          <div class="summary-card-value">{{ fmt((summaryData.persons[0]?.net_income || 0) + (summaryData.persons[0]?.second_income || 0)) }}</div>
        </div>
        <div class="summary-card card-yana">
          <div class="summary-card-label">Netto {{ summaryData.persons[1]?.name }}</div>
          <div class="summary-card-value">{{ fmt((summaryData.persons[1]?.net_income || 0) + (summaryData.persons[1]?.second_income || 0)) }}</div>
        </div>
        <div class="summary-card card-expenses">
          <div class="summary-card-label">Ausgaben</div>
          <div class="summary-card-value" style="color:var(--color-savings)">{{ fmt(summaryData.totalExpenses) }}</div>
        </div>
        <div class="summary-card card-invest">
          <div class="summary-card-label">Investitionen</div>
          <div class="summary-card-value" style="color:var(--purple)">{{ fmt(summaryData.totalInvestments) }}</div>
          <div class="summary-card-sub" v-for="(val, name) in summaryData.personInvestments" :key="name">
            {{ name }}: {{ fmt(val) }}
          </div>
        </div>
        <div class="summary-card card-invest">
          <div class="summary-card-label">Sparen für große Sachen</div>
          <div class="summary-card-value" style="color:var(--purple)">{{ fmt(summaryData.totalSavingsAmount) }}</div>
          <div class="summary-card-sub" v-for="(val, name) in summaryData.personSavings" :key="'sav-'+name">
            {{ name }}: {{ fmt(val) }}
          </div>
        </div>
        <div class="summary-card card-savings">
          <div class="summary-card-label">Sparquote</div>
          <div class="summary-card-value" style="color:var(--green)">{{ summaryData.savingsRate }}%</div>
          <div class="summary-card-sub">{{ fmt(summaryData.totalSaved) }}/Mo gespart</div>
          <div class="summary-card-sub" style="font-size:10px;opacity:0.7">Investitionen + Sparen + Spast Geld</div>
        </div>
        <div class="summary-card card-fun" style="grid-column: 1 / -1">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <div class="summary-card-label" style="margin:0">Spast Geld</div>
            <div class="summary-card-value" style="color:var(--color-fun);margin:0">{{ fmt(summaryData.totalFunNet) }}</div>
          </div>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <div v-for="p in summaryData.persons" :key="'fun-detail-'+p.name"
                 style="flex:1;min-width:200px;background:rgba(255,255,255,0.06);border-radius:12px;padding:12px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <span style="font-weight:700;font-size:14px">{{ p.name }}</span>
                <span style="font-weight:800;font-size:18px;font-variant-numeric:tabular-nums"
                      :style="{color: summaryData.funMoneyNet[p.name] >= 0 ? 'var(--color-fun)' : '#ff3b30'}">
                  {{ fmt(summaryData.funMoneyNet[p.name]) }}
                </span>
              </div>
              <div style="font-size:11px;color:var(--text-muted);border-top:1px solid rgba(255,255,255,0.08);padding-top:8px">
                <div style="display:flex;justify-content:space-between;padding:2px 0">
                  <span>Gehalt</span>
                  <span style="font-weight:600;color:var(--green)">{{ fmt((p.net_income || 0) + (p.second_income || 0)) }}</span>
                </div>
                <div style="display:flex;justify-content:space-between;padding:2px 0" v-if="(p.invest_amount || 0) > 0">
                  <span>Investitionen</span>
                  <span style="font-weight:600;color:var(--purple)">- {{ fmt(p.invest_amount) }}</span>
                </div>
                <div style="display:flex;justify-content:space-between;padding:2px 0" v-if="(p.savings_amount || 0) > 0">
                  <span>Sparen</span>
                  <span style="font-weight:600;color:var(--purple)">- {{ fmt(p.savings_amount) }}</span>
                </div>
                <div style="display:flex;justify-content:space-between;padding:2px 0">
                  <span>Ausgaben (Anteil)</span>
                  <span style="font-weight:600;color:var(--color-savings)">- {{ fmt(summaryData.personExpenses[p.name]) }}</span>
                </div>
                <div v-if="summaryData.deductionItems[p.name]?.length"
                     style="margin-top:6px;border-top:1px solid rgba(255,255,255,0.06);padding-top:4px">
                  <div style="font-size:10px;opacity:0.5;margin-bottom:3px">Davon bereits vom Gehalt abgezogen:</div>
                  <div v-for="d in summaryData.deductionItems[p.name]" :key="'dd-'+d.name"
                       style="display:flex;justify-content:space-between;padding:1px 0;opacity:0.7;font-size:10px">
                    <span>{{ d.name }}</span>
                    <span>- {{ fmt(d.amount) }}</span>
                  </div>
                </div>
                <div style="display:flex;justify-content:space-between;padding:4px 0;margin-top:6px;border-top:1px solid rgba(255,255,255,0.1);font-size:12px;font-weight:700">
                  <span style="color:var(--color-fun)">= Spast Geld</span>
                  <span style="color:var(--color-fun)">{{ fmt(summaryData.funMoney[p.name]) }}</span>
                </div>
                <div v-if="summaryData.spastItems[p.name]?.length"
                     style="margin-top:6px;border-top:1px solid rgba(255,59,48,0.2);padding-top:4px">
                  <div style="font-size:10px;color:#ff3b30;opacity:0.8;margin-bottom:3px;font-weight:600">Direkt vom Spast Geld:</div>
                  <div v-for="d in summaryData.spastItems[p.name]" :key="'sp-'+d.name"
                       style="display:flex;justify-content:space-between;padding:1px 0;font-size:10px;color:#ff3b30;opacity:0.8">
                    <span>{{ d.name }}</span>
                    <span>- {{ fmt(d.amount) }}</span>
                  </div>
                  <div style="display:flex;justify-content:space-between;padding:3px 0;margin-top:3px;border-top:1px solid rgba(255,255,255,0.08);font-size:12px;font-weight:800;color:var(--color-fun)">
                    <span>= Frei verf\u00FCgbar</span>
                    <span>{{ fmt(summaryData.funMoneyNet[p.name]) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Charts -->
      <div class="charts-row">
        <div class="chart-card">
          <div class="chart-title">Ausgaben-Verteilung</div>
          <div class="chart-container">
            <canvas ref="donutCanvas"></canvas>
          </div>
        </div>
        <div class="chart-card">
          <div class="chart-title">Vergleich pro Person</div>
          <div class="chart-container">
            <canvas ref="barCanvas"></canvas>
          </div>
        </div>
      </div>

      <!-- Insights -->
      <div class="insights-section" v-if="insights.length">
        <div class="insight-card" v-for="(tip, i) in insights" :key="i">
          <div class="insight-icon" :class="tip.icon">
            <span v-if="tip.icon === 'tip'">💡</span>
            <span v-else-if="tip.icon === 'warn'">⚠️</span>
            <span v-else>✅</span>
          </div>
          <div class="insight-text">
            <div class="insight-title">{{ tip.title }}</div>
            <div class="insight-desc">{{ tip.desc }}</div>
          </div>
        </div>
      </div>

      <!-- Budget by Account -->
      <div v-for="bank in accountSections" :key="bank.key" style="margin:16px 0">
        <!-- Bank Header -->
        <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-radius:14px 14px 0 0;font-weight:700"
             :style="{background: bank.color + '18', borderBottom: '2px solid ' + bank.color + '40'}">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:20px">{{ bank.icon }}</span>
            <span style="font-size:15px">{{ bank.label }}</span>
            <span style="font-size:12px;opacity:0.6;font-weight:500">{{ bank.pct }}%</span>
          </div>
          <div style="text-align:right">
            <div style="font-size:16px;font-variant-numeric:tabular-nums">{{ fmt(bank.total) }}<span style="font-size:11px;opacity:0.5">/Mo</span></div>
            <div style="font-size:11px;opacity:0.5;font-weight:400">{{ fmt(bank.total * 12) }}/Jahr</div>
          </div>
        </div>

        <!-- Per-person splits for bank -->
        <div style="display:flex;gap:0;background:var(--card-bg);border-left:1px solid var(--border);border-right:1px solid var(--border)">
          <div v-for="p in data.persons" :key="'bank-split-'+bank.key+'-'+p.name"
               style="flex:1;padding:8px 16px;font-size:12px;display:flex;justify-content:space-between;border-right:1px solid var(--border)">
            <span style="color:var(--text-muted)">{{ p.name }}</span>
            <span style="font-weight:700;font-variant-numeric:tabular-nums">{{ fmt(bank.splits[p.name]) }}</span>
          </div>
        </div>

        <!-- Subgroups (e.g. Revolut Auto, Revolut Wohnung) -->
        <div v-for="grp in bank.subgroups" :key="'grp-'+bank.key+'-'+grp.name"
             style="background:var(--card-bg);border-left:1px solid var(--border);border-right:1px solid var(--border)">
          <!-- Subgroup header -->
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-top:1px solid var(--border)"
               :style="{background: bank.color + '08'}">
            <div style="display:flex;align-items:center;gap:6px">
              <div style="width:3px;height:16px;border-radius:2px" :style="{background: bank.color}"></div>
              <span style="font-weight:700;font-size:13px">{{ grp.name }}</span>
              <span style="font-size:11px;color:var(--text-muted)">{{ grp.pct }}%</span>
            </div>
            <div style="font-weight:700;font-size:13px;font-variant-numeric:tabular-nums">{{ fmt(grp.total) }}</div>
          </div>
          <!-- Subgroup items -->
          <div v-for="item in grp.items" :key="'grp-item-'+item.name"
               style="display:flex;justify-content:space-between;align-items:center;padding:6px 16px 6px 35px;border-top:1px solid var(--border);font-size:12px">
            <div style="flex:1;min-width:0">
              <span style="color:var(--text-secondary)">{{ item.name }}</span>
              <span style="color:var(--text-muted);font-size:10px;margin-left:6px">{{ item.pct }}%</span>
            </div>
            <div style="display:flex;gap:12px;align-items:center;flex-shrink:0">
              <span v-for="p in data.persons" :key="'gi-'+item.name+'-'+p.name"
                    style="font-size:11px;color:var(--text-muted);font-variant-numeric:tabular-nums;min-width:60px;text-align:right">
                {{ fmt(item.splits[p.name] || 0) }}
              </span>
              <span style="font-weight:600;font-variant-numeric:tabular-nums;min-width:70px;text-align:right">{{ fmt(item.amount) }}</span>
            </div>
          </div>
          <!-- Subgroup person totals -->
          <div style="display:flex;gap:0;border-top:1px solid var(--border)" :style="{background: bank.color + '06'}">
            <div v-for="p in data.persons" :key="'grp-total-'+grp.name+'-'+p.name"
                 style="flex:1;padding:4px 16px;font-size:11px;display:flex;justify-content:space-between;border-right:1px solid var(--border)">
              <span style="color:var(--text-muted)">{{ p.name }}</span>
              <span style="font-weight:600;font-variant-numeric:tabular-nums">{{ fmt(grp.splits[p.name]) }}</span>
            </div>
          </div>
        </div>

        <!-- Direct items (not in a subgroup) -->
        <div v-for="item in bank.directItems" :key="'direct-'+bank.key+'-'+item.name"
             style="display:flex;justify-content:space-between;align-items:center;padding:8px 16px;background:var(--card-bg);border:1px solid var(--border);border-top:none;font-size:13px">
          <div style="flex:1;min-width:0">
            <span>{{ item.name }}</span>
            <span style="color:var(--text-muted);font-size:11px;margin-left:6px">{{ item.pct }}%</span>
          </div>
          <div style="display:flex;gap:12px;align-items:center;flex-shrink:0">
            <span v-for="p in data.persons" :key="'di-'+item.name+'-'+p.name"
                  style="font-size:11px;color:var(--text-muted);font-variant-numeric:tabular-nums;min-width:60px;text-align:right">
              {{ fmt(item.splits[p.name] || 0) }}
            </span>
            <span style="font-weight:700;font-variant-numeric:tabular-nums;min-width:70px;text-align:right">{{ fmt(item.amount) }}</span>
          </div>
        </div>

        <!-- Bottom rounded corners -->
        <div style="height:4px;border-radius:0 0 14px 14px;background:var(--card-bg);border:1px solid var(--border);border-top:none"></div>
      </div>
    </div>
  `
};
