import { NextRequest, NextResponse } from 'next/server';
import { taxEngine } from '@/lib/engine/tax';
import { getSessionUser } from '@/lib/auth-server';

const GAS_URL = process.env.NEXT_PUBLIC_GAS_URL || 'https://script.google.com/macros/s/AKfycbzdcT2cZO5ynSBVMWakir1Y5aAaf5MJaqRq1C8zXDrECdaLbtT_yw3idz7FUNjpMShriw/exec';

async function gasGet(sheet: string): Promise<any[]> {
    const url = `${GAS_URL}?action=getAll&sheet=${sheet}`;
    const response = await fetch(url);
    const data = await response.json();
    return Array.isArray(data) ? data : [];
}

export async function GET(request: NextRequest) {
    try {
        const user = await getSessionUser(request);
        if (!user) {
            return NextResponse.json({ error: 'Не авторизован' }, { status: 401 });
        }

        const [transactions, companies, settings] = await Promise.all([
            gasGet('Transactions'),
            gasGet('Companies'),
            gasGet('Settings')
        ]);

        await taxEngine.loadSettings(settings);

        const usnCompanies = companies.filter(c =>
            c.tax_system === 'USN_6' || c.tax_system === 'USN_15'
        );

        const limits = usnCompanies.map(company => {
            const limitInfo = taxEngine.checkUSNLimits(company, transactions);

            // Прогноз на основе Run Rate
            const monthlyRunRate = taxEngine.getMonthlyRunRate(company, transactions) || 0;
            const currentRevenue = limitInfo.current_revenue || 0;
            const exemptThreshold = limitInfo.limits?.exempt?.threshold || 20000000;

            let projectedExceedDate: string | null = null;
            if (monthlyRunRate > 0 && currentRevenue < exemptThreshold) {
                const remaining = exemptThreshold - currentRevenue;
                const monthsToExceed = Math.ceil(remaining / monthlyRunRate);
                if (monthsToExceed <= 12) {
                    const now = new Date();
                    const exceedDate = new Date(now.getFullYear(), now.getMonth() + monthsToExceed, 1);
                    projectedExceedDate = `${exceedDate.getFullYear()}-${String(exceedDate.getMonth() + 1).padStart(2, '0')}`;
                }
            }

            return {
                company_id: company.id,
                company_name: company.name,
                tax_system: company.tax_system,
                monthly_run_rate: monthlyRunRate,
                projected_exceed_date: projectedExceedDate,
                ...limitInfo
            };
        });

        return NextResponse.json(limits);
    } catch (error) {
        console.error('Ошибка API:', error);
        return NextResponse.json([]);
    }
}
