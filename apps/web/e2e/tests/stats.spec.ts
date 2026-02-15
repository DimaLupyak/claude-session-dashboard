import { test, expect } from '@playwright/test'

test.describe('Stats Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/stats')
    // Wait for stats to load (summary cards appear)
    await page.waitForSelector('text=Total Sessions', { timeout: 15_000 })
  })

  test('Given stats-cache.json exists in fixtures, When I visit /stats, Then I see summary cards', async ({
    page,
  }) => {
    await expect(page.getByText('Total Sessions').first()).toBeVisible()
    await expect(page.getByText('Total Messages').first()).toBeVisible()
    await expect(page.getByText('Total Tokens').first()).toBeVisible()
    await expect(page.getByText('Longest Session').first()).toBeVisible()
    await page.screenshot({
      path: 'e2e/screenshots/stats-overview.png',
      fullPage: true,
    })
  })

  test('Given stats data exists, When I view the stats page, Then I see "3" as total sessions', async ({
    page,
  }) => {
    // The stat card for Total Sessions should contain the value "3"
    const totalSessionsCard = page
      .locator('div.rounded-xl')
      .filter({ hasText: 'Total Sessions' })
      .first()
    await expect(totalSessionsCard).toContainText('3')
  })

  test('Given stats data exists, Then I see the Daily Activity chart rendered', async ({
    page,
  }) => {
    // Activity chart has heading "Daily Activity"
    await expect(page.getByText('Daily Activity').first()).toBeVisible()
  })

  test('Given stats data exists, Then I see the Model Usage chart rendered', async ({
    page,
  }) => {
    await expect(page.getByText('Model Usage').first()).toBeVisible()
  })

  test('Given I am on the stats page, When I click the "Projects" tab, Then I see the Projects analytics view', async ({
    page,
  }) => {
    await page.click('button:has-text("Projects")')
    await expect(page).toHaveURL(/tab=projects/)

    // Wait for project analytics to load
    await expect(page.getByText('Total Projects').first()).toBeVisible()
    await page.screenshot({
      path: 'e2e/screenshots/stats-projects.png',
      fullPage: true,
    })
  })
})
