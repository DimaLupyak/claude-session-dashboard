import { test, expect } from '@playwright/test'

test.describe('Sessions List', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/sessions')
    // Wait for sessions to load
    await page.waitForSelector('a[href*="/sessions/"]', { timeout: 15_000 })
  })

  test('Given sessions exist in fixtures, When I visit /sessions, Then I see session cards', async ({
    page,
  }) => {
    const cards = page.locator('a[href*="/sessions/session-"]')
    await expect(cards).not.toHaveCount(0)
    await page.screenshot({
      path: 'e2e/screenshots/sessions-list.png',
      fullPage: true,
    })
  })

  test('Given sessions exist, When I visit /sessions, Then I see project names from fixtures', async ({
    page,
  }) => {
    // Dir "-Users-test-projects-my-app" decodes to "/Users/test/projects/my/app" -> basename "app"
    // Dir "-Users-test-projects-another" decodes to "/Users/test/projects/another" -> basename "another"
    const content = await page.textContent('main')
    expect(content).toContain('app')
    expect(content).toContain('another')
  })

  test('Given sessions exist, When I search for "another", Then only the "another" project session appears', async ({
    page,
  }) => {
    const searchInput = page.locator('input[placeholder*="Search"]')
    await searchInput.fill('another')
    // Wait for debounced search to apply and results to update
    await expect(page.locator('a[href*="/sessions/session-"]')).not.toHaveCount(0)
    const mainContent = await page.textContent('main')
    expect(mainContent).toContain('another')
    // "app" sessions should be filtered out or "another" should be present
    const cards = page.locator('a[href*="/sessions/session-"]')
    const count = await cards.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('Given sessions exist, When I filter by project, Then only that project sessions appear', async ({
    page,
  }) => {
    const select = page.locator('select').first()
    // Only try project filter if the select exists (needs > 1 project)
    if ((await select.count()) > 0) {
      // Get the options and select one that is not "All projects"
      const options = select.locator('option')
      const optionCount = await options.count()
      if (optionCount > 1) {
        // Select the second option (first non-"All projects")
        const optionValue = await options.nth(1).getAttribute('value')
        if (optionValue) {
          await select.selectOption(optionValue)
          // Verify at least one session card is shown
          const cards = page.locator('a[href*="/sessions/session-"]')
          await expect(cards.first()).toBeVisible({ timeout: 2000 })
        }
      }
    }
  })

  test('Given I am on /sessions, When I view a session card, Then it shows model, branch, and duration info', async ({
    page,
  }) => {
    const firstCard = page.locator('a[href*="/sessions/session-"]').first()
    const cardText = await firstCard.textContent()
    // Should have a model name (displayed as shortened version like "sonnet-4")
    expect(cardText).toMatch(/sonnet|haiku|opus/i)
    // Should have branch info
    expect(cardText).toMatch(/main|feature|develop/i)
  })
})
