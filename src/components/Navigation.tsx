'use client';

import { usePathname } from 'next/navigation';

export default function Navigation() {
  const pathname = usePathname();

  const navItems = [
    { href: '/', label: 'Дашборд' },
    { href: '/companies', label: 'Компании' },
    { href: '/transactions', label: 'Операции' },
    { href: '/reports', label: 'Отчёты' },
    { href: '/planning', label: 'Планирование' },
    { href: '/settings', label: 'Настройки' },
    { href: '/diagnostics', label: 'Диагностика' },
    { href: '/settings/data-quality', label: 'Качество данных' },
  ];

  return (
    <nav className="px-4 py-4 space-y-1">
      {navItems.map((item) => {
        const isActive = pathname === item.href;

        return (
          <a
            key={item.href}
            href={item.href}
            className={`block px-4 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${isActive
                ? 'bg-blue-50 text-blue-700 shadow-sm'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
          >
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}
