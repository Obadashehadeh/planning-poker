export class UrlChecker {

  /**
   * Check if a URL parameter exists in the current URL
   * @param paramName The name of the parameter to check for
   * @returns True if the parameter exists, false otherwise
   */
  static hasParam(paramName: string): boolean {
    const url = new URL(window.location.href);
    return url.searchParams.has(paramName);
  }

  /**
   * Get the value of a URL parameter
   * @param paramName The name of the parameter to get
   * @returns The parameter value or null if it doesn't exist
   */
  static getParam(paramName: string): string | null {
    const url = new URL(window.location.href);
    return url.searchParams.get(paramName);
  }

  /**
   * Add a parameter to the current URL without reloading the page
   * @param paramName The name of the parameter to add
   * @param paramValue The value to set
   */
  static addParam(paramName: string, paramValue: string): void {
    const url = new URL(window.location.href);
    url.searchParams.set(paramName, paramValue);
    window.history.replaceState({}, '', url.toString());
  }

  /**
   * Debug URL parameters - logs all URL parameters to console
   */
  static debugParams(): void {
    const url = new URL(window.location.href);
    const params: Record<string, string> = {};

    url.searchParams.forEach((value, key) => {
      params[key] = value;
    });

    console.log('URL Parameters:', params);
  }

  /**
   * Generate a debug URL with the current session ID
   * @param sessionId The session ID to use in the URL
   * @returns A URL that can be used to join the session
   */
  static generateSessionUrl(sessionId: string): string {
    const currentUrl = new URL(window.location.href);
    // Remove any existing path segments
    currentUrl.pathname = '/main-game';
    // Add the session parameter
    currentUrl.searchParams.set('session', sessionId);

    return currentUrl.toString();
  }

  /**
   * Check if the current URL's session parameter matches the expected session ID
   * @param expectedSessionId The expected session ID
   * @returns True if the session parameter matches, false otherwise
   */
  static isSessionMatch(expectedSessionId: string): boolean {
    const sessionParam = this.getParam('session');
    return sessionParam === expectedSessionId;
  }
}
