import { NextRequest, NextResponse } from 'next/server';
import { getRepository } from '@/lib/dal/repository';
import { dataCache, CACHE_PREFIXES } from '@/lib/cache';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    const sheet = url.searchParams.get('sheet');
    const id = url.searchParams.get('id');

    if (!sheet) {
      return NextResponse.json({ error: 'Не указан sheet' }, { status: 400 });
    }

    const repo = getRepository();

    if (action === 'getAll') {
      const data = await repo.getAll(sheet);
      return NextResponse.json(data);
    }

    if (action === 'getById') {
      if (!id) return NextResponse.json({ error: 'Не указан id' }, { status: 400 });
      const item = await repo.getById(sheet, id);
      return NextResponse.json(item);
    }

    if (action === 'delete') {
      if (!id) return NextResponse.json({ error: 'Не указан id' }, { status: 400 });
      const success = await repo.delete(sheet, id);
      // Инвалидация кэша
      dataCache.invalidate(CACHE_PREFIXES.DATA);
      dataCache.invalidate(CACHE_PREFIXES.REPORTS);
      dataCache.invalidate(CACHE_PREFIXES.BALANCE);
      dataCache.invalidate(CACHE_PREFIXES.USN_LIMITS);
      return NextResponse.json({ success });
    }

    return NextResponse.json({ error: 'Неизвестный action: ' + action }, { status: 400 });

  } catch (error: any) {
    console.error('Ошибка API GET:', error);
    return NextResponse.json(
      { error: 'Внутренняя ошибка: ' + error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action;
    const sheet = body.sheet;
    const data = body.data;
    const id = body.id;

    if (!sheet) {
      return NextResponse.json({ error: 'Не указан sheet' }, { status: 400 });
    }

    const repo = getRepository();

    if (action === 'create') {
      const result = await repo.create(sheet, data);
      // Инвалидация кэша
      dataCache.invalidate(CACHE_PREFIXES.DATA);
      dataCache.invalidate(CACHE_PREFIXES.REPORTS);
      dataCache.invalidate(CACHE_PREFIXES.BALANCE);
      dataCache.invalidate(CACHE_PREFIXES.USN_LIMITS);
      return NextResponse.json(result);
    }

    if (action === 'update') {
      if (!id) return NextResponse.json({ error: 'Не указан id' }, { status: 400 });
      const result = await repo.update(sheet, id, data);
      dataCache.invalidate(CACHE_PREFIXES.DATA);
      dataCache.invalidate(CACHE_PREFIXES.REPORTS);
      dataCache.invalidate(CACHE_PREFIXES.BALANCE);
      dataCache.invalidate(CACHE_PREFIXES.USN_LIMITS);
      return NextResponse.json(result);
    }

    if (action === 'batchCreate') {
      const result = await repo.batchCreate(sheet, data);
      dataCache.invalidate(CACHE_PREFIXES.DATA);
      dataCache.invalidate(CACHE_PREFIXES.REPORTS);
      dataCache.invalidate(CACHE_PREFIXES.BALANCE);
      dataCache.invalidate(CACHE_PREFIXES.USN_LIMITS);
      return NextResponse.json(result);
    }

    if (action === 'deleteByHash') {
      const hash = body.hash;
      if (!hash) return NextResponse.json({ error: 'Не указан hash' }, { status: 400 });
      const result = await repo.deleteByHash(sheet, hash);
      dataCache.invalidate(CACHE_PREFIXES.DATA);
      dataCache.invalidate(CACHE_PREFIXES.REPORTS);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Неизвестный action: ' + action }, { status: 400 });

  } catch (error: any) {
    console.error('Ошибка API POST:', error);
    return NextResponse.json(
      { error: 'Внутренняя ошибка: ' + error.message },
      { status: 500 }
    );
  }
}
