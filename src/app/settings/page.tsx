"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<string>("database");
  const [connections, setConnections] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddConnection, setShowAddConnection] = useState(false);
  const [isLoadingTestData, setIsLoadingTestData] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);

  // Форма подключения
  const [connectionForm, setConnectionForm] = useState({
    name: "",
    type: "google_sheets",
    host: "",
    port: "",
    database_name: "",
    user: "",
    password: "",
    spreadsheet_id: "",
    api_url: "",
  });
  // Форма счёта
  const [accountForm, setAccountForm] = useState({
    code: "",
    name: "",
    type: "A",
    is_cash_flow: false,
  });

  useEffect(() => {
    loadData();
    loadActiveApiUrl();
  }, [activeSection]);

  const loadData = async () => {
    try {
      setLoading(true);
      if (activeSection === "database") {
        // DatabaseConnections — не модель в Neon, загрузка не требуется
        setConnections([]);
      } else if (activeSection === "accounts") {
        const data = await api.getAll("Accounts");
        setAccounts(data);
      }
    } catch (error) {
      console.error("Ошибка загрузки:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadActiveApiUrl = async () => {
    // Функция устарела — подключения хранятся в env (DATABASE_URL)
  };

  const handleAddConnection = async () => {
    try {
      // Валидация
      if (!connectionForm.name) {
        alert("Введите название");
        return;
      }

      // Формируем config
      const config: any = {};

      if (connectionForm.type === "google_sheets") {
        config.api_url = connectionForm.api_url;
      } else {
        config.host = connectionForm.host;
        config.port = connectionForm.port;
        config.database_name = connectionForm.database_name;
        config.user = connectionForm.user;
        config.password = connectionForm.password;
      }

      console.log("Создаём подключение:", {
        name: connectionForm.name,
        type: connectionForm.type,
        config: JSON.stringify(config),
        is_active: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_deleted: "",
        deleted_at: "",
      });

      await api.create("DatabaseConnections", {
        name: connectionForm.name,
        type: connectionForm.type,
        config: JSON.stringify(config),
        is_active: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_deleted: "",
        deleted_at: "",
      });

      alert("Подключение сохранено");
      setShowAddConnection(false);
      setConnectionForm({
        name: "",
        type: "google_sheets",
        host: "",
        port: "",
        database_name: "",
        user: "",
        password: "",
        spreadsheet_id: "",
        api_url: "",
      });
      loadData();
    } catch (error) {
      console.error("Ошибка:", error);
      alert("Ошибка при сохранении подключения: " + (error as Error).message);
    }
  };
  const handleLoadTestData = async () => {
    if (
      !confirm(
        "Загрузить тестовые данные? Будут созданы компании, счета и операции.",
      )
    )
      return;

    try {
      setIsLoadingTestData(true);

      const response = await fetch("/api/test-data", {
        method: "POST",
      });

      const result = await response.json();

      if (result.success) {
        alert(
          `Загружено: ${result.companies} компаний, ${result.accounts} счетов, ${result.transactions} операций`,
        );
      } else {
        alert("Ошибка: " + result.error);
      }
    } catch (error) {
      console.error("Ошибка загрузки:", error);
      alert("Ошибка при загрузке тестовых данных");
    } finally {
      setIsLoadingTestData(false);
    }
  };

  const handleAddAccount = async () => {
    try {
      await api.create("Accounts", {
        ...accountForm,
        is_cash_flow: accountForm.is_cash_flow ? "TRUE" : "FALSE",
      });
      setShowAddAccount(false);
      setAccountForm({
        code: "",
        name: "",
        type: "A",
        is_cash_flow: false,
      });
      loadData();
      alert("Счёт добавлен");
    } catch (error) {
      console.error("Ошибка:", error);
      alert("Ошибка при добавлении счёта");
    }
  };

  const handleDeleteAccount = async (id: string) => {
    if (!confirm("Удалить счёт?")) return;
    try {
      await api.delete("Accounts", id);
      loadData();
    } catch (error) {
      console.error("Ошибка:", error);
      alert("Ошибка при удалении");
    }
  };

  const sections = [
    { id: "database", label: "База данных" },
    { id: "accounts", label: "Счета" },
    { id: "balances", label: "Начальные остатки" },
    { id: "sources", label: "Источники данных" },
    { id: "mappings", label: "Маппинги" },
    { id: "taxes", label: "Налоги" },
    { id: "payment_delays", label: "Отсрочки платежей" },
    { id: "users", label: "Пользователи" },
    { id: "notifications", label: "Уведомления" },
  ];

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Настройки</h2>
        <p className="text-gray-500 mt-1">Конфигурация системы</p>
      </div>

      <div className="flex gap-6">
        {/* Левое меню настроек */}
        <div className="w-64 shrink-0">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-2">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => {
                  if (section.id === "sources") {
                    window.location.href = "/settings/sources";
                  } else if (section.id === "mappings") {
                    window.location.href = "/settings/mappings";
                  } else if (section.id === "balances") {
                    window.location.href = "/settings/balances";
                  } else if (section.id === "taxes") {
                    window.location.href = "/settings/taxes";
                  } else if (section.id === "payment_delays") {
                    window.location.href = "/settings/payment-delays";
                  } else {
                    setActiveSection(section.id);
                  }
                }}
                className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeSection === section.id
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {section.label}
              </button>
            ))}
          </div>
        </div>

        {/* Контент */}
        <div className="flex-1">
          {/* База данных */}
          {activeSection === "database" && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">
                  Подключения к базам данных
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAddConnection(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                  >
                    + Добавить подключение
                  </button>
                  <button
                    onClick={handleLoadTestData}
                    disabled={isLoadingTestData}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                  >
                    {isLoadingTestData
                      ? "Загрузка..."
                      : "Загрузить тестовые данные"}
                  </button>
                </div>
              </div>

              {/* Форма добавления */}
              {showAddConnection && (
                <div className="mb-6 bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-4">
                    Новое подключение
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Название
                      </label>
                      <input
                        type="text"
                        value={connectionForm.name}
                        onChange={(e) =>
                          setConnectionForm({
                            ...connectionForm,
                            name: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="Основная база"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Тип
                      </label>
                      <select
                        value={connectionForm.type}
                        onChange={(e) =>
                          setConnectionForm({
                            ...connectionForm,
                            type: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      >
                        <option value="google_sheets">Google Sheets</option>
                        <option value="postgresql">PostgreSQL</option>
                        <option value="mysql">MySQL</option>
                        <option value="sqlite">SQLite</option>
                      </select>
                    </div>
                    {connectionForm.type === "google_sheets" && (
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          URL API (Google Apps Script)
                        </label>
                        <input
                          type="text"
                          value={connectionForm.api_url}
                          onChange={(e) =>
                            setConnectionForm({
                              ...connectionForm,
                              api_url: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          placeholder="https://script.google.com/macros/s/.../exec"
                        />
                        <p className="text-xs text-gray-400 mt-1">
                          URL из деплоя Google Apps Script (Web App). GAS уже
                          связан с таблицей.
                        </p>
                      </div>
                    )}
                    {connectionForm.type !== "google_sheets" && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Хост
                          </label>
                          <input
                            type="text"
                            value={connectionForm.host}
                            onChange={(e) =>
                              setConnectionForm({
                                ...connectionForm,
                                host: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            placeholder="localhost"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Порт
                          </label>
                          <input
                            type="text"
                            value={connectionForm.port}
                            onChange={(e) =>
                              setConnectionForm({
                                ...connectionForm,
                                port: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            placeholder="5432"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            База данных
                          </label>
                          <input
                            type="text"
                            value={connectionForm.database_name}
                            onChange={(e) =>
                              setConnectionForm({
                                ...connectionForm,
                                database_name: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            placeholder="finengine"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Пользователь
                          </label>
                          <input
                            type="text"
                            value={connectionForm.user}
                            onChange={(e) =>
                              setConnectionForm({
                                ...connectionForm,
                                user: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            placeholder="admin"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Пароль
                          </label>
                          <input
                            type="password"
                            value={connectionForm.password}
                            onChange={(e) =>
                              setConnectionForm({
                                ...connectionForm,
                                password: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={handleAddConnection}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                    >
                      Сохранить
                    </button>
                    <button
                      onClick={() => setShowAddConnection(false)}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              )}

              {/* Список подключений */}
              <div className="space-y-3">
                {connections.length === 0 ? (
                  <p className="text-gray-500 text-sm">Нет подключений</p>
                ) : (
                  connections.map((conn) => {
                    const isActive =
                      conn.is_active === "true" ||
                      conn.is_active === true ||
                      conn.is_active === "TRUE";

                    return (
                      <div
                        key={conn.id}
                        className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
                      >
                        <div>
                          <p className="font-medium text-gray-900">
                            {conn.name}
                          </p>
                          <p className="text-sm text-gray-500">
                            Тип: {conn.type}
                          </p>
                          {conn.type === "google_sheets" && (
                            <p className="text-sm text-gray-500">
                              API:{" "}
                              {(() => {
                                try {
                                  const config = JSON.parse(
                                    conn.config || "{}",
                                  );
                                  return config.api_url
                                    ? config.api_url.substring(0, 50) + "..."
                                    : "Не указан";
                                } catch {
                                  return "Не указан";
                                }
                              })()}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              isActive
                                ? "bg-green-100 text-green-800"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {isActive ? "Активна" : "Неактивна"}
                          </span>
                          {!isActive && (
                            <button
                              onClick={async () => {
                                try {
                                  // Деактивируем все
                                  for (const c of connections) {
                                    if (
                                      c.is_active === "true" ||
                                      c.is_active === true ||
                                      c.is_active === "TRUE"
                                    ) {
                                      await api.update(
                                        "DatabaseConnections",
                                        c.id,
                                        { ...c, is_active: "false" },
                                      );
                                    }
                                  }

                                  // Активируем выбранное
                                  await api.update(
                                    "DatabaseConnections",
                                    conn.id,
                                    { ...conn, is_active: "true" },
                                  );

                                  // Устанавливаем URL API
                                  try {
                                    const config = JSON.parse(
                                      conn.config || "{}",
                                    );
                                    if (config.api_url) {
                                      console.log(
                                        "URL API установлен:",
                                        config.api_url,
                                      );
                                    }
                                  } catch (e) {
                                    console.error("Ошибка парсинга config:", e);
                                  }

                                  loadData();
                                  alert("Подключение активировано");
                                } catch (error) {
                                  console.error("Ошибка активации:", error);
                                  alert("Ошибка при активации");
                                }
                              }}
                              className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 cursor-pointer"
                            >
                              Сделать активной
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Счета */}
          {activeSection === "accounts" && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">
                  Справочник счетов
                </h3>
                <button
                  onClick={() => setShowAddAccount(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                >
                  + Добавить счёт
                </button>
              </div>

              {showAddAccount && (
                <div className="mb-6 bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-4">Новый счёт</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Код
                      </label>
                      <input
                        type="text"
                        value={accountForm.code}
                        onChange={(e) =>
                          setAccountForm({
                            ...accountForm,
                            code: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="BANK_ALFA"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Название
                      </label>
                      <input
                        type="text"
                        value={accountForm.name}
                        onChange={(e) =>
                          setAccountForm({
                            ...accountForm,
                            name: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="Альфа-Банк"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Тип
                      </label>
                      <select
                        value={accountForm.type}
                        onChange={(e) =>
                          setAccountForm({
                            ...accountForm,
                            type: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      >
                        <option value="A">Актив</option>
                        <option value="L">Пассив</option>
                        <option value="E">Капитал</option>
                        <option value="I">Доход</option>
                        <option value="X">Расход</option>
                      </select>
                    </div>
                    <div className="flex items-center mt-6">
                      <input
                        type="checkbox"
                        checked={accountForm.is_cash_flow}
                        onChange={(e) =>
                          setAccountForm({
                            ...accountForm,
                            is_cash_flow: e.target.checked,
                          })
                        }
                        className="mr-2 h-4 w-4"
                      />
                      <label className="text-sm font-medium text-gray-700">
                        Денежный счёт
                      </label>
                    </div>
                  </div>
                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={handleAddAccount}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                    >
                      Сохранить
                    </button>
                    <button
                      onClick={() => setShowAddAccount(false)}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              )}

              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                      Код
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                      Название
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                      Тип
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                      Денежный
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                      Действия
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {accounts.map((account) => (
                    <tr key={account.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {account.code}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {account.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {account.type}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {account.is_cash_flow === "TRUE" ||
                        account.is_cash_flow === true
                          ? "Да"
                          : "Нет"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleDeleteAccount(account.id)}
                          className="text-red-600 hover:text-red-800 text-sm font-medium"
                        >
                          Удалить
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Заглушки для остальных разделов */}
          {["sources", "mappings", "taxes", "users", "notifications"].includes(
            activeSection,
          ) && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
              <p className="text-gray-500">
                Раздел будет реализован в следующих этапах
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
