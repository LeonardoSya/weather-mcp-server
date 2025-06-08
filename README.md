# How to build a MCP Server ( node.js )

使用Node.js编写一个简单的MCP天气服务

### 准备工作

```bash
mkdir

npm init -y
npm install @modelcontextprotocol/sdk zod
npm install -D @types/node typescript

mkdir src
touch src/index.ts
```

```json
//* package.json 
{
  "name": "weather-mcp",
  "version": "1.0.0",
  "main": "index.js",
  //? MCP SDK推荐使用ES模块
  "type": "module", 
  "description": "",
  //? 创建全局命令行工具，用户安装后可以直接运行weather命令启动这个MCP服务器，这是MCP服务器的标准分发模式
  "bin": {
    "weather": "./build/index.js"
  },
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1",
    //? build脚本中，tsc用于编译ts代码，chmod 755设置执行权限，确保命令行工具可以运行
    "build": "tsc && chmod 755 build/index.js"
  },
  //? 指定发布时只包含构建后的文件，可以减少包大小
  "files": [
    "build"
  ],
  "keywords": [],
  "author": "",
  "license": "ISC",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "zod": "^3.25.23"
  },
  "devDependencies": {
    "@types/node": "^22.15.21",
    "typescript": "^5.8.3"
  }
}
```

```json
//* tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

### 创建mcp server实例

```tsx
/** src/index.ts */
// Create server instance
const server = new McpServer({
  name: "weather",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
  },
});
```

### 注册mcp server的工具

`server.tool()` 是mcp服务器向agent注册可用工具的方法。每次调用此方法，就相当于向agent宣告：“我这里有一个新的能力/工具，你可以在需要时调用它”

```tsx
server.tool(
  "工具名称",           // 1. 工具标识符
  "工具描述",           // 2. 功能说明
  参数模式对象,         // 3. 参数契约
  执行函数            // 4. 实际逻辑
)
```

通过**第二个参数“工具描述”**，agent就知道如何根据描述选择工具；通过**第三个参数“参数模式对象”**，agent就知道如何传递参数。因此agent和mcp server交互的思维示例如下：

![image.png](attachment:28e53df9-1733-4569-8b3e-3a9dcf5a1389:image.png)

server.tool代码如下（省略工具函数，可前往[github](https://github.com/LeonardoSya/weather-mcp-server)查看）：

```tsx
/** src/index.ts */
// Register weather tools
/** agent询问工具“你能做什么?”，我的服务就会回应它拥有get-alerts和get-forecast这两个工具 */
server.tool(
  "get-alerts",
  "Get weather alerts for a state",
  /** get-alerts需要一个state参数 */
  /** 这个对象其实就是一份”参数说明书“(Schema)，当服务器启动并与agent连接时，就会把这份说明书完整地发送给agent，agent就能知道参数名、类型和描述 */
  {
    state: z.string().length(2).describe("Two-letter state code (e.g. CA, NY)"),
  },
  async ({ state }) => {
    const stateCode = state.toUpperCase();
    const alertsUrl = `${NWS_API_BASE}/alerts?area=${stateCode}`;
    const alertsData = await makeNWSRequest<AlertsResponse>(alertsUrl);

    if (!alertsData) {
      return {
        content: [
          {
            type: "text",
            text: "Failed to reterieve alerts data",
          },
        ],
      };
    }

    const features = alertsData.features || [];
    if (features.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No active alerts for ${stateCode}`,
          },
        ],
      };
    }

    const formattedAlerts = features.map(formatAlert);
    const alertsText = `Active alerts for ${stateCode}:\n\n${formattedAlerts.join(
      "\n"
    )}`;
    return {
      content: [
        {
          type: "text",
          text: alertsText,
        },
      ],
    };
  }
);

server.tool(
  "get-forecast",
  "Get weather forecast for a location",
  /** get-forecast需要latitude和longitude参数 */
  {
    latitude: z.number().min(-90).max(90).describe("Latitude of a location"),
    longitude: z
      .number()
      .min(-180)
      .max(180)
      .describe("Longitude of a location"),
  },
  async ({ latitude, longitude }) => {
    // get grid point data
    const pointsUrl = `${NWS_API_BASE}/points/${latitude.toFixed(
      4
    )}, ${longitude.toFixed(4)}`;
    const pointsData = await makeNWSRequest<PointsResponse>(pointsUrl);
    if (!pointsData) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to retrieve grid point data for coordinates: ${latitude}, ${longitude}`,
          },
        ],
      };
    }

    const forecastUrl = pointsData.properties?.forecast;
    if (!forecastUrl) {
      return {
        content: [
          {
            type: "text",
            text: "Failed to get forecast URL from grid point data",
          },
        ],
      };
    }

    // Get forecast data
    const forecastData = await makeNWSRequest<ForecastResponse>(forecastUrl);
    if (!forecastData) {
      return {
        content: [
          {
            type: "text",
            text: "Failed to retrieve forecast data",
          },
        ],
      };
    }

    const periods = forecastData.properties?.periods || [];
    if (periods.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No forecast periods available",
          },
        ],
      };
    }

    // Format forecast periods
    const formattedForecast = periods.map((period: ForecastPeriod) =>
      [
        `${period.name || "Unknown"}:`,
        `Temperature: ${period.temperature || "Unknown"}°${
          period.temperature || "F"
        }`,
        `Wind: ${period.windSpeed || "Unknown"} ${period.windDirection || ""}`,
        `${period.shortForecast || "No forecast available"}`,
        "---",
      ].join("\n")
    );

    const forecastText = `Forecast for ${latitude}, ${longitude}:\n\n${formattedForecast.join(
      "\n"
    )}`;
    return {
      content: [
        {
          type: "text",
          text: forecastText,
        },
      ],
    };
  }
);
```

### main fn

```tsx
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Weather MCP Server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error in main():", err);
  process.exit(1);
});
```

### 构建

```bash
npm run build
npm link --force
```

根据如下的package.json配置，`npm build` 会将src/index.ts编译成javascript，然后输出到build/index.js，然后赋予系统直接运行这个文件的权限(chmod 755)

```
/** package.json */
  "bin": {
    "weather": "./build/index.js"
  },
  "scripts": {
  "build": "tsc && chmod 755 build/index.js"
}
```

**npm link**

`npm link` 做两件事：在全局创建一个指向你本地项目的symbolic link（符号链接），然后将你项目的package.json中**`bin` 字段里指定的任何可执行文件**链接到系统的`PATH`里

这样就能通过`weather` 命令直接启动这个node服务了

![image.png](attachment:be44ee42-968c-4f39-b8b8-5df64887b3e4:image.png)

### 集成custom mcp server到cursor

在`.cursor/mcp.json`中配置

```tsx
{
  "mcpServers": {
    "weather": {                    // 这是mcp server的标识符
      "command": "weather",         // 这是要执行的命令（之前通过npm link创建的）
      "args": []                    // 命令行参数（目前为空，因为这个weather服务器不需要额外参数）
    }
  }
}
```

写完后重启cursor，发现mcp server能够被识别啦

![image.png](attachment:6d4c5ffc-4d18-4ffa-b64c-bc6295c0e9cf:image.png)

新开一个chat view，发现cursor可以调用这个custom mcp了

![image.png](attachment:82313c85-c4af-4ed0-bc5a-5720797220de:image.png)