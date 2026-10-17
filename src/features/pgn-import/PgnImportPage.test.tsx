import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import { paths } from '@/app/paths';
import { ServicesProvider } from '@/app/services';
import type { AppServices } from '@/core/services';
import { createFakeAppServices, createMemoryDataServices, FIXTURE_GAME, type MemoryDataServices } from '@/core/testing';
import { Component as PgnImportPage } from './pages/PgnImportPage';

function Probe() {
  const loc = useLocation();
  return (
    <p data-testid="location" data-duplicate={String((loc.state as { duplicate?: boolean } | null)?.duplicate ?? '')}>
      {loc.pathname}
    </p>
  );
}

function renderPage(services: AppServices) {
  return render(
    <ServicesProvider services={services}>
      <MemoryRouter initialEntries={[paths.analysisImport()]}>
        <Routes>
          <Route path="/analysis/import" element={<PgnImportPage />} />
          <Route path="*" element={<Probe />} />
        </Routes>
      </MemoryRouter>
    </ServicesProvider>,
  );
}

function paste(text: string) {
  fireEvent.change(screen.getByLabelText('PGN einfügen'), { target: { value: text } });
}

const MULTI = `[Event "A"]\n[White "Anna"]\n[Black "Ben"]\n[Result "1-0"]\n\n1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0\n\n[Event "B"]\n[White "Cem"]\n[Black "Dana"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1\n`;

describe('PGN importieren', () => {
  it('imports a pasted game as source pgn and opens its analysis', async () => {
    const user = userEvent.setup();
    const data: MemoryDataServices = createMemoryDataServices();
    renderPage(createFakeAppServices({ data }));
    expect(screen.getByRole('heading', { level: 1, name: 'PGN importieren' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importieren' })).toBeDisabled();
    paste(FIXTURE_GAME.pgn);
    await user.click(screen.getByRole('button', { name: 'Importieren' }));
    const loc = await screen.findByTestId('location');
    const games = await data.repos.games.list({ source: 'pgn' });
    expect(games).toHaveLength(1);
    expect(games[0]!.externalId).toMatch(/^[0-9a-f]{64}$/);
    expect(loc).toHaveTextContent(paths.analysisGame(games[0]!.id));
    expect(loc).toHaveAttribute('data-duplicate', 'false');
  });

  it('a duplicate opens the existing game without storing it again', async () => {
    const user = userEvent.setup();
    const data = createMemoryDataServices();
    const services = createFakeAppServices({ data });
    const first = renderPage(services);
    paste(FIXTURE_GAME.pgn);
    await user.click(screen.getByRole('button', { name: 'Importieren' }));
    await screen.findByTestId('location');
    first.unmount();
    renderPage(services);
    paste(FIXTURE_GAME.pgn.replace('14. Qc2', '14. Qc2?? {Patzer}'));
    await user.click(screen.getByRole('button', { name: 'Importieren' }));
    const loc = await screen.findByTestId('location');
    const games = await data.repos.games.list({ source: 'pgn' });
    expect(games).toHaveLength(1);
    expect(loc).toHaveTextContent(paths.analysisGame(games[0]!.id));
    expect(loc).toHaveAttribute('data-duplicate', 'true');
  });

  it('shows a German error with the line number for an invalid PGN', async () => {
    const user = userEvent.setup();
    renderPage(createFakeAppServices());
    paste('[Event "Test"]\n[White "A"]\n[Black "B"]\n\n1. e4 e5\n2. Nf3 Nc6\n3. Nf9 Nf6 *');
    await user.click(screen.getByRole('button', { name: 'Importieren' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Zeile 7: Ungültiger Zug „Nf9“ \(Zug 3, Weiß\)/);
    expect(screen.getByLabelText('PGN einfügen')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByTestId('location')).toBeNull();
  });

  it('several games → selection list; the chosen game is imported', async () => {
    const user = userEvent.setup();
    const data = createMemoryDataServices();
    renderPage(createFakeAppServices({ data }));
    paste(MULTI);
    await user.click(screen.getByRole('button', { name: 'Importieren' }));
    const list = await screen.findByRole('list', { name: 'Partien in der PGN' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: '2 Partien gefunden' })).toBeInTheDocument();
    expect(within(list).getByText('Cem – Dana')).toBeInTheDocument();
    await user.click(within(list).getByRole('button', { name: 'Cem – Dana importieren und analysieren' }));
    await screen.findByTestId('location');
    const games = await data.repos.games.list({ source: 'pgn' });
    expect(games).toHaveLength(1);
    expect(games[0]!.headers.White).toBe('Cem');
    expect(games[0]!.result).toBe('0-1');
  });

  it('"Alle importieren" stores every game and opens the hub', async () => {
    const user = userEvent.setup();
    const data = createMemoryDataServices();
    renderPage(createFakeAppServices({ data }));
    paste(MULTI);
    await user.click(screen.getByRole('button', { name: 'Importieren' }));
    await user.click(await screen.findByRole('button', { name: 'Alle importieren' }));
    expect(await screen.findByTestId('location')).toHaveTextContent('/analysis');
    expect(await data.repos.games.list({ source: 'pgn' })).toHaveLength(2);
  });

  it('reads an uploaded .pgn file (CRLF, BOM)', async () => {
    const user = userEvent.setup();
    const data = createMemoryDataServices();
    renderPage(createFakeAppServices({ data }));
    const text = '﻿[White "Anna"]\r\n[Black "Ben"]\r\n\r\n1. d4 d5 2. c4 e6 *\r\n';
    const file = new File([text], 'partie.pgn', { type: 'application/x-chess-pgn' });
    await user.upload(screen.getByTestId('pgn-file'), file);
    await waitFor(async () => expect(await data.repos.games.list({ source: 'pgn' })).toHaveLength(1));
    expect(await screen.findByTestId('location')).toHaveTextContent(/^\/analysis\/.+/);
  });
});
