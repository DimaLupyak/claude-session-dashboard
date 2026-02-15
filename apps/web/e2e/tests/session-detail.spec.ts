import { test, expect } from '@playwright/test'

test.describe('Session Detail', () => {
  test('Given session-001 exists, When I click on its card from the sessions list, Then I see the detail page with project name', async ({
    page,
  }) => {
    await page.goto('/sessions')
    await page.waitForSelector('a[href*="/sessions/session-"]', {
      timeout: 15_000,
    })

    // Click the session-001 card
    const sessionCard = page.locator('a[href*="/sessions/session-001"]')
    await sessionCard.click()

    // Wait for detail page to load -- h1 should show the decoded project name "app"
    await expect(page.locator('h1')).toContainText('app')

    await page.screenshot({
      path: 'e2e/screenshots/session-detail-001.png',
      fullPage: true,
    })
  })

  test('Given I am on session-001 detail, Then I see the Context Window panel', async ({
    page,
  }) => {
    // Navigate directly to session-001 detail via the sessions list
    await page.goto('/sessions')
    await page.waitForSelector('a[href*="/sessions/session-001"]', {
      timeout: 15_000,
    })
    await page.click('a[href*="/sessions/session-001"]')
    await expect(page.locator('h1')).toContainText('app')

    await expect(page.getByText('Context Window', { exact: false }).first()).toBeVisible()
  })

  test('Given I am on session-001 detail, Then I see the Tool Usage panel with Read, Write, Bash tools', async ({
    page,
  }) => {
    await page.goto('/sessions')
    await page.waitForSelector('a[href*="/sessions/session-001"]', {
      timeout: 15_000,
    })
    await page.click('a[href*="/sessions/session-001"]')
    await expect(page.locator('h1')).toContainText('app')

    await expect(page.getByText('Tool Usage', { exact: false }).first()).toBeVisible()
    const mainContent = await page.textContent('main')
    expect(mainContent).toContain('Read')
    expect(mainContent).toContain('Write')
    expect(mainContent).toContain('Bash')
  })

  test('Given I am on session-001 detail, Then I see the Cost Estimation panel', async ({
    page,
  }) => {
    await page.goto('/sessions')
    await page.waitForSelector('a[href*="/sessions/session-001"]', {
      timeout: 15_000,
    })
    await page.click('a[href*="/sessions/session-001"]')
    await expect(page.locator('h1')).toContainText('app')

    await expect(page.getByText('Cost Estimation', { exact: false }).first()).toBeVisible()
  })

  test('Given I am on session-002 detail, Then I see the error panel with the overload error', async ({
    page,
  }) => {
    await page.goto('/sessions')
    await page.waitForSelector('a[href*="/sessions/session-002"]', {
      timeout: 15_000,
    })
    await page.click('a[href*="/sessions/session-002"]')
    await expect(page.locator('h1')).toContainText('app')

    // The ErrorPanel has an h3 with "Errors (N)" text
    await expect(
      page.locator('h3').filter({ hasText: /Errors/ }),
    ).toBeVisible()
    await expect(page.getByText('overloaded').first()).toBeVisible()

    await page.screenshot({
      path: 'e2e/screenshots/session-detail-002-errors.png',
      fullPage: true,
    })
  })

  test('Given I am on session-001 detail, When I click the Sessions breadcrumb, Then I return to the sessions list', async ({
    page,
  }) => {
    await page.goto('/sessions')
    await page.waitForSelector('a[href*="/sessions/session-001"]', {
      timeout: 15_000,
    })
    await page.click('a[href*="/sessions/session-001"]')
    await expect(page.locator('h1')).toContainText('app')

    // Click the breadcrumb back link (the "Sessions" link in the detail header)
    // It's an <a> with href="/sessions" in the main content area (not sidebar)
    await page.locator('main a[href="/sessions"]').click()
    await expect(page).toHaveURL(/\/sessions/)
  })
})
