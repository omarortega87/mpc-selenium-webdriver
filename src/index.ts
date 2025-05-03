import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Builder, By, Key, until } from "selenium-webdriver";
import * as fs from "fs"; // Use ES module import for Node.js
import { Options } from "selenium-webdriver/chrome";


const byStrategies: Record<string, (value: string) => By> = {
  id: By.id,
  className: By.className,
  xpath: By.xpath,
  css: By.css,
};

// Define a type for the Selenium WebDriver session details
const ensureString = (value: string | undefined): string => {
  if (!value) {
    throw new Error("Expected a string but received undefined");
  }
  return value;
};

const ensureValidKey = (key: string | ((...var_args: string[]) => string)): string => {
  if (typeof key === "function") {
    throw new Error("Expected a string but received a function");
  }
  return key;
};

// Create an MCP server instance
const server = new McpServer({
  name: "selenium-mcp-server",
  version: "1.0.0",
});

server.resource(
  "webdriver-session",
  "session://details",
  async () => {
    return {
      contents: [
        {
          uri: "session://details",
          text: "Selenium WebDriver session details will be here."
        }
      ]
    };
  }
);

server.tool(
  "run-selenium-command",
  {
    command: z.string().describe("The Selenium command to execute"),
    args: z.array(z.string()).optional().describe("Arguments for the Selenium command"),
  },
  async ({ command, args = [] }) => { // Provide default value for args
    const driver = await new Builder().forBrowser("chrome").build();
    try {
      if (command === "navigate") {
        await driver.get(args[0]);
        return {
          content: [
            {
              type: "text",
              text: `Navigated to ${args[0]}`,
            },
          ],
        };
      } else if (command === "findElement") {
        const element = await driver.findElement(byStrategies[args[0]](args[1]));
        return {
          content: [
            {
              type: "text",
              text: `Found element with ${args[0]}: ${args[1]}`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `Unknown command: ${command}`,
            },
          ],
        };
      }
    } catch (error) {
      const err = error as Error; 
      return {
        content: [
          {
            type: "text",
            text: `Error executing command: ${err.message}`,
          },
        ],
      };
    } finally {
      await driver.quit();
    }
  }
);


server.tool(
  "start-browser-session",
  {
    browser: z.string().describe("The browser to start (e.g., chrome, firefox)"),
    headless: z.boolean().optional().describe("Run in headless mode")
  },
  async ({ browser, headless }) => {
    const options = new Options();
    if (headless) {
      options.addArguments("--headless");
    }
    const driver = await new Builder().forBrowser(browser).setChromeOptions(options).build();
    return {
      content: [
        {
          type: "text",
          text: `Started ${browser} browser session${headless ? " in headless mode" : ""}`,
        },
      ],
    };
  }
);

server.tool(
  "navigate-to-url",
  {
    url: z.string().url().describe("The URL to navigate to")
  },
  async ({ url }) => {
    const driver = await new Builder().forBrowser("chrome").build();
    await driver.get(url);
    return {
      content: [
        {
          type: "text",
          text: `Navigated to ${url}`,
        },
      ],
    };
  }
);

server.tool(
  "find-element",
  {
    strategy: z.string().describe("The locator strategy (e.g., id, className, xpath)"),
    value: z.string().describe("The value for the locator strategy")
  },
  async ({ strategy, value }) => {
    const driver = await new Builder().forBrowser("chrome").build();
    const element = await driver.findElement(byStrategies[strategy](value));
    return {
      content: [
        {
          type: "text",
          text: `Found element using ${strategy}: ${value}`,
        },
      ],
    };
  }
);

server.tool(
  "interact-with-element",
  {
    strategy: z.string().describe("The locator strategy"),
    value: z.string().describe("The value for the locator strategy"),
    action: z.string().describe("The action to perform (e.g., click, type)"),
    input: z.string().optional().describe("Input text for typing"),
  },
  async ({ strategy, value, action, input }) => {
    const driver = await new Builder().forBrowser("chrome").build();
    const element = await driver.findElement(byStrategies[strategy](value));
    if (action === "click") {
      await element.click();
    } else if (action === "type") {
      await element.sendKeys(ensureString(input));
    }
    return {
      content: [
        {
          type: "text",
          text: `Performed ${action} on element using ${strategy}: ${value}`,
        },
      ],
    };
  }
);

server.tool(
  "mouse-action",
  {
    action: z.string().describe("The mouse action to perform (e.g., hover, dragAndDrop)"),
    source: z.string().describe("The source element locator"),
    target: z.string().optional().describe("The target element locator for drag and drop")
  },
  async ({ action, source, target }) => {
    const driver = await new Builder().forBrowser("chrome").build();
    const actions = driver.actions();
    const sourceElement = await driver.findElement(By.css(source));
    if (action === "hover") {
      await actions.move({ origin: sourceElement }).perform();
    } else if (action === "dragAndDrop" && target) {
      const targetElement = await driver.findElement(By.css(target));
      await actions.dragAndDrop(sourceElement, targetElement).perform();
    }
    return {
      content: [
        {
          type: "text",
          text: `Performed ${action} action` + (target ? ` from ${source} to ${target}` : ` on ${source}`),
        },
      ],
    };
  }
);

server.tool(
  "keyboard-input",
  {
    keys: z.string().describe("The keys to send (e.g., ENTER, TAB)"),
  },
  async ({ keys }) => {
    const driver = await new Builder().forBrowser("chrome").build();
    await driver.actions().sendKeys(ensureValidKey(Key[keys as keyof typeof Key])).perform();
    return {
      content: [
        {
          type: "text",
          text: `Sent keyboard input: ${keys}`,
        },
      ],
    };
  }
);

server.tool(
  "take-screenshot",
  {
    filename: z.string().describe("The filename to save the screenshot"),
  },
  async ({ filename }) => {
    const driver = await new Builder().forBrowser("chrome").build();
    const screenshot = await driver.takeScreenshot();
    fs.writeFileSync(filename, screenshot, "base64"); // Use fs module for file operations
    return {
      content: [
        {
          type: "text",
          text: `Screenshot saved as ${filename}`,
        },
      ],
    };
  }
);

server.tool(
  "upload-file",
  {
    strategy: z.string().describe("The locator strategy"),
    value: z.string().describe("The value for the locator strategy"),
    filePath: z.string().describe("The file path to upload")
  },
  async ({ strategy, value, filePath }) => {
    const driver = await new Builder().forBrowser("chrome").build();
    const element = await driver.findElement(byStrategies[strategy](value));
    await element.sendKeys(filePath);
    return {
      content: [
        {
          type: "text",
          text: `Uploaded file: ${filePath}`,
        },
      ],
    };
  }
);

const transport = new StdioServerTransport();
server.connect(transport).then(() => {
  console.log("Selenium MCP Server is running...");
});