import '@testing-library/jest-dom';
import { vi } from 'vitest';

const localStorageMock = (function () {
    let store: Record<string, string> = {};
    return {
        getItem: vi.fn((key: string) => store[key] || null),
        setItem: vi.fn((key: string, value: string) => {
            store[key] = value.toString();
        }),
        clear: vi.fn(() => {
            store = {};
        }),
        removeItem: vi.fn((key: string) => {
            delete store[key];
        }),
        length: 0,
        key: vi.fn((index: number) => null),
    };
})();

Object.defineProperty(window, 'localStorage', {
    value: localStorageMock
});
