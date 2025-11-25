#!/usr/bin/env bun

import * as fs from "fs/promises";

async function run() {
  try {
    const ddApiKey = process.env.DD_API_KEY;
    const ddSite = process.env.DD_SITE || "datadoghq.com";
    const ddMetricPrefix = "github";
    const outputFile = process.env.OUTPUT_FILE;

    // Skip if no API key provided
    if (!ddApiKey) {
      console.log("⏭️  Skipping Datadog metrics reporting (no API key provided)");
      return;
    }

    // Skip if no output file
    if (!outputFile) {
      console.log("⏭️  Skipping Datadog metrics reporting (no execution file)");
      return;
    }

    // Read and parse execution file
    let outputData;
    try {
      const fileContent = await fs.readFile(outputFile, "utf8");
      outputData = JSON.parse(fileContent);
    } catch (error) {
      console.error("Error reading execution file:", error);
      return;
    }

    // Get the last element which contains execution details
    if (!Array.isArray(outputData) || outputData.length === 0) {
      console.log("⏭️  No execution data found");
      return;
    }

    const lastElement = outputData[outputData.length - 1];
    if (lastElement.type !== "result") {
      console.log("⏭️  No result data found in execution file");
      return;
    }

    // Extract metrics
    const metrics = {
      num_turns: lastElement.num_turns,
      cost_usd: lastElement.total_cost_usd || lastElement.cost_usd,
      duration_ms: lastElement.duration_ms,
      duration_api_ms: lastElement.duration_api_ms,
      is_error: lastElement.is_error || false,
    };

    console.log("📊 Reporting metrics to Datadog:");
    if (ddMetricPrefix) {
      console.log(`  - Prefix: ${ddMetricPrefix}`);
    }
    console.log(`  - Turns: ${metrics.num_turns}`);
    console.log(`  - Cost: $${metrics.cost_usd?.toFixed(4) || "N/A"}`);
    console.log(`  - Duration: ${metrics.duration_ms}ms`);
    console.log(`  - Error: ${metrics.is_error}`);

    // Prepare tags
    const tags = [
      `repo:${process.env.GITHUB_REPOSITORY}`,
      `event:${process.env.GITHUB_EVENT_NAME}`,
      `actor:${process.env.GITHUB_ACTOR}`,
      `workflow:${process.env.GITHUB_WORKFLOW}`,
      `success:${!metrics.is_error}`,
    ];

    // Helper function to build metric name with prefix
    const buildMetricName = (name: string) => {
      if (ddMetricPrefix) {
        return `${ddMetricPrefix}.claude_code_gh_action.${name}`;
      }
      return `claude_code_gh_action.${name}`;
    };

    // Build series data for Datadog
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const series = [];

    if (metrics.num_turns !== undefined) {
      series.push({
        metric: buildMetricName("num_turns"),
        type: 1, // gauge
        points: [[currentTimestamp, metrics.num_turns]],
        tags,
      });
    }

    if (metrics.cost_usd !== undefined) {
      series.push({
        metric: buildMetricName("cost_usd"),
        type: 1, // gauge
        points: [[currentTimestamp, metrics.cost_usd]],
        tags,
      });
    }

    if (metrics.duration_ms !== undefined) {
      series.push({
        metric: buildMetricName("duration_ms"),
        type: 1, // gauge
        points: [[currentTimestamp, metrics.duration_ms]],
        tags,
      });
    }

    if (metrics.duration_api_ms !== undefined) {
      series.push({
        metric: buildMetricName("duration_api_ms"),
        type: 1, // gauge
        points: [[currentTimestamp, metrics.duration_api_ms]],
        tags,
      });
    }

    // Always send execution count
    series.push({
      metric: buildMetricName("executions"),
      type: 0, // count
      points: [[currentTimestamp, 1]],
      tags,
    });

    if (series.length === 0) {
      console.log("⏭️  No metrics to report");
      return;
    }

    // Send to Datadog
    const response = await fetch(`https://api.${ddSite}/api/v2/series`, {
      method: "POST",
      headers: {
        "DD-API-KEY": ddApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ series }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Failed to send metrics to Datadog: ${response.status} ${response.statusText}`,
      );
      console.error(`Response: ${errorText}`);
      return;
    }

    console.log("✅ Successfully reported metrics to Datadog");
    process.exit(0);
  } catch (error) {
    console.error("Error reporting metrics to Datadog:", error);
    // Don't fail the action if metrics reporting fails
    process.exit(0);
  }
}

run();
