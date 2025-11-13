/**
 * Example: Browser Testing with Code Execution Pattern
 *
 * This demonstrates the new MCP code execution approach:
 * - Only imports the tools actually needed
 * - Composes operations naturally in code
 * - Keeps intermediate data in execution sandbox
 * - Dramatically reduces context usage
 */

// Only import what we need - not all 26 chrome-devtools tools!
import { navigate, navigateAndWait } from '../servers/chrome-devtools/navigate';
import { screenshot, fullPageScreenshot } from '../servers/chrome-devtools/screenshot';
import { click } from '../servers/chrome-devtools/click';
import { fill } from '../servers/chrome-devtools/fill';
import { snapshot } from '../servers/chrome-devtools/snapshot';

/**
 * Test the Baku Reserve reservation flow
 */
async function testReservationFlow() {
  console.log("Starting Baku Reserve reservation flow test...");

  // 1. Navigate to the app
  await navigate("http://localhost:8081");
  console.log("✓ Navigated to app");

  // 2. Take initial screenshot
  await screenshot({ filePath: './test-results/home.png' });
  console.log("✓ Captured home screen");

  // 3. Get page snapshot to find elements
  const pageSnapshot = await snapshot();
  console.log("✓ Got page snapshot");

  // 4. Find and click on a restaurant
  // In the old pattern, we'd need to load the click tool definition
  // Now we just import and use it!
  const restaurantElement = findElementInSnapshot(pageSnapshot, "Nizami Restaurant");
  if (restaurantElement) {
    await click(restaurantElement.uid);
    console.log("✓ Clicked on restaurant");
  }

  // 5. Fill reservation form
  const dateInput = findElementInSnapshot(pageSnapshot, "input[type='date']");
  const timeInput = findElementInSnapshot(pageSnapshot, "input[type='time']");
  const guestsInput = findElementInSnapshot(pageSnapshot, "input[name='guests']");

  if (dateInput && timeInput && guestsInput) {
    await fill(dateInput.uid, "2024-12-01");
    await fill(timeInput.uid, "19:00");
    await fill(guestsInput.uid, "4");
    console.log("✓ Filled reservation form");
  }

  // 6. Submit reservation
  const submitButton = findElementInSnapshot(pageSnapshot, "Reserve");
  if (submitButton) {
    await click(submitButton.uid);
    console.log("✓ Submitted reservation");
  }

  // 7. Capture confirmation
  await screenshot({ filePath: './test-results/confirmation.png' });
  console.log("✓ Test completed successfully!");

  // Return test results
  return {
    success: true,
    screenshots: [
      './test-results/home.png',
      './test-results/confirmation.png'
    ],
    steps: 7
  };
}

/**
 * Helper function to find elements in snapshot
 * Keeps processing logic in execution environment
 */
function findElementInSnapshot(snapshot: any, query: string): any {
  // This processing happens in the execution sandbox
  // Not passed through model context!

  // Search logic here...
  return snapshot.elements?.find((el: any) =>
    el.text?.includes(query) || el.attributes?.includes(query)
  );
}

/**
 * Run performance test with network monitoring
 */
async function testPerformance() {
  // We can selectively import performance tools only when needed
  const { startTrace, stopTrace } = await import('../servers/chrome-devtools/performance');
  const { listNetworkRequests } = await import('../servers/chrome-devtools/network');

  console.log("Starting performance test...");

  await startTrace({ reload: true, autoStop: false });
  await navigate("http://localhost:8081");

  // Wait for page to fully load
  await new Promise(resolve => setTimeout(resolve, 3000));

  const traceResults = await stopTrace();
  const networkRequests = await listNetworkRequests();

  // Process results in execution environment
  const metrics = {
    loadTime: traceResults.metrics?.domContentLoaded,
    totalRequests: networkRequests.length,
    failedRequests: networkRequests.filter((r: any) => r.status >= 400).length,
    totalSize: networkRequests.reduce((sum: number, r: any) => sum + r.size, 0)
  };

  console.log("Performance metrics:", metrics);
  return metrics;
}

// Export for use in other tests
export { testReservationFlow, testPerformance };