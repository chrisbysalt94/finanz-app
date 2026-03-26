const DashboardView = {
  props: ['data'],
  setup(props) {
    const { computed, onMounted, watch, nextTick, ref } = Vue;

    const donutCanvas = ref(null);
    const barCanvas = ref(null);
    let donutChart = null;
    let barChart = null;

    const sections = computed(() => {
      if (!props.data) return [];
      const { categories, items, parentSums, persons } = props.data;

      const sectionOrder = ['income', 'deductions', 'savings', 'fixed', 'auto', 'contracts', 'housing'];
      const sectionLabels = {
        income: 'Einkommen', deductions: 'Abzüge', savings: 'Sparen',
        fixed: 'Fixkosten', auto: 'Auto', contracts: 'Verträge', housing: 'Wohnung',
      };
      const sectionClasses = {
        income: 'section-income', deductions: 'section-deductions',
        savings: 'section-savings', fixed: 'section-fixed',
        auto: 'section-auto', contracts: 'section-contracts',
        housing: 'section-housing',
      };

      const result = [];
      for (const sec of sectionOrder) {
        const topCats = categories.filter(c => c.section === sec && c.parent_id === null);
        if (topCats.length === 0) continue;

        const rows = [];
        let sectionTotal = 0;
        for (const parent of topCats) {
          const children = items.filter(i => i.parent_id === parent.id);
          const directItem = items.find(i => i.category_id === parent.id);

          if (children.length > 0) {
            const sum = parentSums[parent.id];
            if (sum) {
              sectionTotal += sum.amount_total;
              rows.push({
                type: 'parent', name: parent.name, amount: sum.amount_total,
                splits: sum.splits, target: directItem?.target_account || '',
              });
            }
            for (const child of children) {
              rows.push({
                type: 'child', name: child.category_name, amount: child.amount_total,
                splits: child.splits, target: child.target_account || '',
              });
            }
          } else if (directItem) {
            sectionTotal += directItem.amount_total;
            rows.push({
              type: 'item', name: parent.name, amount: directItem.amount_total,
              splits: directItem.splits, target: directItem.target_account || '',
            });
          }
        }

        result.push({
          key: sec, label: sectionLabels[sec], cssClass: sectionClasses[sec],
          rows, total: sectionTotal,
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

      // Deductions (items from 'deductions' section) - tracked separately for display
      const personDeductions = {};
      const deductionItems = {};
      for (const p of persons) {
        personDeductions[p.name] = 0;
        deductionItems[p.name] = [];
      }

      for (const item of items) {
        if (item.section === 'income') continue;
        totalExpenses += item.amount_total;
        for (const p of persons) {
          const amount = item.splits[p.name] || 0;
          personExpenses[p.name] += amount;
          if (item.section === 'deductions' && amount > 0) {
            personDeductions[p.name] += amount;
            deductionItems[p.name].push({ name: item.category_name, amount });
          }
        }
      }

      // Fun money = total salary - investments - savings - expenses
      const funMoney = {};
      for (const p of persons) {
        const totalSalary = p.net_income + (p.second_income || 0);
        funMoney[p.name] = Math.round((totalSalary - (p.invest_amount || 0) - (p.savings_amount || 0) - personExpenses[p.name]) * 100) / 100;
      }

      const totalFun = Math.round(Object.values(funMoney).reduce((a, b) => a + b, 0) * 100) / 100;
      totalInvestments = Math.round(totalInvestments * 100) / 100;
      totalSavingsAmount = Math.round(totalSavingsAmount * 100) / 100;
      // True savings = investments + savings + fun money (money left over)
      const totalSaved = totalFun + totalInvestments + totalSavingsAmount;
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
        totalFun,
        totalSaved,
        savingsRate,
        investRate,
        persons,
        personExpenses,
        deductionItems,
      };
    });

    // Insights/Recommendations
    const insights = computed(() => {
      if (!summaryData.value || !sections.value.length) return [];
      const tips = [];
      const s = summaryData.value;

      // Savings rate (investments + fun money)
      if (s.savingsRate < 10) {
        tips.push({ icon: 'warn', title: 'Niedrige Sparquote', desc: `Eure Sparquote liegt bei ${s.savingsRate}% (inkl. ${fmt(s.totalInvestments)} Investitionen + ${fmt(s.totalSavingsAmount)} Sparen). Ziel: mindestens 20%.` });
      } else if (s.savingsRate >= 20) {
        tips.push({ icon: 'good', title: 'Starke Sparquote!', desc: `${s.savingsRate}% eures Einkommens wird gespart — davon ${s.investRate}% in Investitionen (${fmt(s.totalInvestments)}/Mo).` });
      } else {
        tips.push({ icon: 'tip', title: 'Sparquote', desc: `${s.savingsRate}% Sparquote (inkl. Investitionen + Sparen). Ziel: 20% für finanzielle Sicherheit.` });
      }

      // Housing ratio
      const housingSection = sections.value.find(s => s.key === 'housing');
      if (housingSection) {
        const housingRatio = Math.round(housingSection.total / s.totalIncome * 100);
        if (housingRatio > 35) {
          tips.push({ icon: 'warn', title: 'Hohe Wohnkosten', desc: `${housingRatio}% des Einkommens gehen für Wohnen drauf. Empfohlen: max. 30-35%.` });
        } else {
          tips.push({ icon: 'good', title: 'Wohnkosten im Rahmen', desc: `${housingRatio}% für Wohnung liegt im empfohlenen Bereich.` });
        }
      }

      // Fun money balance
      const names = Object.keys(s.funMoney);
      if (names.length === 2) {
        const diff = Math.abs(s.funMoney[names[0]] - s.funMoney[names[1]]);
        if (diff < 50) {
          tips.push({ icon: 'good', title: 'Faire Aufteilung', desc: `Nur ${fmt(diff)} Unterschied beim Spast Geld. Das ist ausgewogen!` });
        }
      }

      // 50/30/20 Rule
      const needsRatio = Math.round((s.totalExpenses - (s.funMoney[names[0]] || 0) - (s.funMoney[names[1]] || 0)) / s.totalIncome * 100);
      tips.push({ icon: 'tip', title: '50/30/20 Regel', desc: `Fixkosten: ~${needsRatio}% (Ziel: 50%), Spast: ~${100 - needsRatio - s.savingsRate}% (Ziel: 30%), Sparen: ~${s.savingsRate}% (Ziel: 20%)` });

      return tips;
    });

    // Chart data for donut
    const chartData = computed(() => {
      if (!sections.value.length) return null;
      const expSections = sections.value.filter(s => s.key !== 'income');
      return {
        labels: expSections.map(s => s.label),
        values: expSections.map(s => Math.round(s.total * 100) / 100),
        colors: ['#5856d6', '#ff3b30', '#ff9500', '#5ac8fa', '#ff2d55', '#ff9500'],
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

    return { sections, summaryData, insights, fmt, donutCanvas, barCanvas };
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
        <div class="summary-card card-fun">
          <div class="summary-card-label">Spast Geld</div>
          <div class="summary-card-value" style="color:var(--color-fun)">{{ fmt(summaryData.totalFun) }}</div>
          <div class="summary-card-sub" v-for="(val, name) in summaryData.funMoney" :key="name">
            {{ name }}: {{ fmt(val) }}
          </div>
          <div style="margin-top:8px;border-top:1px solid rgba(255,255,255,0.1);padding-top:6px">
            <div style="font-size:10px;opacity:0.7;margin-bottom:4px">Bereits abgezogen:</div>
            <template v-for="(items, pName) in summaryData.deductionItems" :key="'ded-'+pName">
              <div v-for="d in items" :key="'d-'+pName+'-'+d.name"
                   style="font-size:10px;display:flex;justify-content:space-between;opacity:0.6;padding:1px 0">
                <span>{{ pName }}: {{ d.name }}</span>
                <span>{{ fmt(d.amount) }}</span>
              </div>
            </template>
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

      <!-- Budget Sections -->
      <div class="section-group" v-for="section in sections" :key="section.key">
        <div class="section-header" :class="section.cssClass">
          <span>{{ section.label }}</span>
          <span class="section-total">{{ fmt(section.total) }}/Mo</span>
        </div>
        <div class="table-scroll">
          <table class="budget-table">
            <thead>
              <tr>
                <th style="width:35%">Kategorie</th>
                <th v-for="p in data.persons" :key="p.name">{{ p.name }}</th>
                <th>Gesamt</th>
                <th>Jahr</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, idx) in section.rows" :key="idx"
                  :class="{ 'row-parent': row.type === 'parent', 'row-child': row.type === 'child' }">
                <td>{{ row.name }}</td>
                <td v-for="p in data.persons" :key="p.name"
                    :class="{ 'amount-zero': (row.splits[p.name] || 0) === 0 }">
                  {{ fmt(row.splits[p.name] || 0) }}
                </td>
                <td>{{ fmt(row.amount) }}</td>
                <td>
                  {{ fmt(row.amount * 12) }}
                  <div style="font-size:10px;color:var(--text-muted);font-weight:400" v-for="p in data.persons" :key="'yr-'+p.name">
                    {{ p.name }}: {{ fmt((row.splits[p.name] || 0) * 12) }}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `
};
