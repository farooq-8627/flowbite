# Testing Guide

**Last Updated**: April 30, 2026  
**Status**: Complete Testing Infrastructure

---

## 📊 Testing Overview

FlowBite has comprehensive testing coverage across three layers:

1. **Unit Tests** - Vitest + React Testing Library
2. **E2E Tests** - Playwright
3. **Backend Tests** - Convex Test (already implemented)

---

## 🧪 Unit Tests (Vitest)

### Running Tests

```bash
# Run all frontend tests
pnpm test:frontend

# Watch mode (re-run on file changes)
pnpm test:frontend:watch

# UI mode (interactive test runner)
pnpm test:frontend:ui

# Coverage report
pnpm test:frontend:coverage
```

### Test Files

Tests are located next to the files they test:
- `lib/preferences/theme-utils.test.ts` - Theme utility tests
- `lib/stores/preferences-store.test.ts` - Preferences store tests

### Writing Tests

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MyComponent } from './MyComponent'

describe('MyComponent', () => {
  it('should render correctly', () => {
    render(<MyComponent />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })
})
```

### Configuration

- **Config**: `vitest.config.ts`
- **Setup**: `vitest.setup.ts`
- **Environment**: happy-dom (faster than jsdom)

---

## 🎭 E2E Tests (Playwright)

### Running Tests

```bash
# Run all E2E tests
pnpm test:e2e

# UI mode (interactive)
pnpm test:e2e:ui

# Debug mode (step through tests)
pnpm test:e2e:debug

# Run specific test file
pnpm test:e2e e2e/theme-switching.spec.ts
```

### Test Files

E2E tests are in the `e2e/` directory:
- `e2e/theme-switching.spec.ts` - Theme switching tests
- `e2e/navigation.spec.ts` - Navigation tests

### Writing E2E Tests

```typescript
import { test, expect } from '@playwright/test'

test('should do something', async ({ page }) => {
  await page.goto('/dashboard/test-org')
  await page.click('button')
  await expect(page.locator('h1')).toHaveText('Success')
})
```

### Configuration

- **Config**: `playwright.config.ts`
- **Browsers**: Chromium, Firefox, WebKit, Mobile Chrome, Mobile Safari
- **Base URL**: http://localhost:3000

---

## 🔧 Backend Tests (Convex)

### Running Tests

```bash
# Run Convex tests
pnpm test

# Watch mode
pnpm test:watch

# UI mode
pnpm test:ui
```

### Test Files

Backend tests are in `convex/`:
- `convex/users.test.ts`
- `convex/orgs.test.ts`
- `convex/permissions.test.ts`
- `convex/invitations.test.ts`
- `convex/authenticated.test.ts`

---

## 🚀 Running All Tests

```bash
# Run all tests (backend + frontend + E2E)
pnpm test:all
```

---

## 📈 Test Coverage

### Current Coverage

- **Backend**: ✅ 5 test files (users, orgs, permissions, invitations, authenticated)
- **Frontend**: ✅ 2 test files (theme-utils, preferences-store)
- **E2E**: ✅ 2 test files (theme-switching, navigation)

### Coverage Goals

- **Unit Tests**: 80%+ coverage for utilities and stores
- **E2E Tests**: Cover all critical user flows
- **Backend Tests**: Already comprehensive

### Viewing Coverage

```bash
# Generate coverage report
pnpm test:frontend:coverage

# Open coverage report
open coverage/index.html
```

---

## 🎯 What to Test

### Unit Tests (Vitest)

✅ **Test These**:
- Utility functions (theme-utils, layout-utils)
- State management (preferences-store)
- Custom hooks
- Pure functions
- Business logic

❌ **Don't Test These**:
- UI components (use E2E instead)
- Next.js internals
- Third-party libraries

### E2E Tests (Playwright)

✅ **Test These**:
- User flows (login, navigation, settings)
- Theme switching
- Preference changes
- Responsive behavior
- Accessibility

❌ **Don't Test These**:
- Implementation details
- Internal state
- API responses (mock them)

---

## 🐛 Debugging Tests

### Vitest Debugging

```bash
# Run tests in UI mode
pnpm test:frontend:ui

# Run specific test file
pnpm test:frontend theme-utils.test.ts

# Run specific test
pnpm test:frontend -t "should apply dark mode"
```

### Playwright Debugging

```bash
# Debug mode (step through tests)
pnpm test:e2e:debug

# UI mode (interactive)
pnpm test:e2e:ui

# Run with headed browser
pnpm test:e2e --headed

# Run specific browser
pnpm test:e2e --project=chromium
```

---

## 📝 Best Practices

### Unit Tests

1. **Test behavior, not implementation**
   ```typescript
   // ✅ Good
   expect(result).toBe('dark')
   
   // ❌ Bad
   expect(component.state.theme).toBe('dark')
   ```

2. **Use descriptive test names**
   ```typescript
   // ✅ Good
   it('should apply dark mode when theme is set to dark')
   
   // ❌ Bad
   it('test theme')
   ```

3. **Keep tests isolated**
   ```typescript
   beforeEach(() => {
     // Reset state before each test
     cleanup()
   })
   ```

### E2E Tests

1. **Use user-facing selectors**
   ```typescript
   // ✅ Good
   page.getByRole('button', { name: 'Submit' })
   
   // ❌ Bad
   page.locator('.btn-submit')
   ```

2. **Wait for elements**
   ```typescript
   // ✅ Good
   await expect(page.locator('h1')).toBeVisible()
   
   // ❌ Bad
   expect(page.locator('h1')).toBeTruthy()
   ```

3. **Test critical paths first**
   - Authentication
   - Navigation
   - Data creation/editing
   - Settings changes

---

## 🔄 CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'pnpm'
      
      - run: pnpm install
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm test:frontend
      - run: pnpm test:e2e
```

---

## 📚 Resources

### Documentation
- [Vitest Docs](https://vitest.dev/)
- [Playwright Docs](https://playwright.dev/)
- [Testing Library Docs](https://testing-library.com/)
- [Convex Test Docs](https://docs.convex.dev/testing)

### Examples
- `lib/preferences/theme-utils.test.ts` - Unit test example
- `e2e/theme-switching.spec.ts` - E2E test example
- `convex/users.test.ts` - Backend test example

---

## 🎯 Next Steps

### Immediate
- ✅ Testing infrastructure set up
- ✅ Example tests created
- ✅ Documentation complete

### Short-term
- [ ] Add more unit tests for utilities
- [ ] Add E2E tests for auth flow
- [ ] Add E2E tests for CRUD operations
- [ ] Set up CI/CD pipeline

### Long-term
- [ ] Achieve 80%+ test coverage
- [ ] Add visual regression tests
- [ ] Add performance tests
- [ ] Add accessibility tests

---

**Status**: ✅ Testing infrastructure complete and ready to use
