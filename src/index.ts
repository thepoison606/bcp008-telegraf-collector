// src/index.ts

import axios from 'axios';

import { WebSocketClient } from './websocket';
import { TelegrafWriter } from './telegrafWriter';
import { mapNotificationToLine, ObjectInfo } from './dataMapper';

import {
    QueryApiResponse,
    WebSocketNotificationMsg,
    NcMethodResultBlockMemberDescriptors,
    NcMethodResultNumber
} from './datatypes';

interface DeviceConnectionInfo {
    deviceId: string;
    deviceLabel: string;
    nodeId: string;
    receivers: string[];
    wsUrl: string;
}

interface DeviceSession {
    info: DeviceConnectionInfo;
    client: WebSocketClient;
    objectInfos: Map<number, ObjectInfo>;
}

async function fetchDevicesFromRegistry(registryBaseUrl: string, is04Version: string): Promise<QueryApiResponse[]> {
    const url = `${registryBaseUrl}/x-nmos/query/${is04Version}/devices`;
    const { data } = await axios.get(url);

    if (!Array.isArray(data)) {
        throw new Error(`Unexpected registry response at ${url} (expected array of devices).`);
    }

    return data as QueryApiResponse[];
}

function buildDeviceConnections(
    devices: QueryApiResponse[],
    ncpControlType: string,
    wsHostOverride?: string
): DeviceConnectionInfo[] {
    return devices
        .map((device): DeviceConnectionInfo | null => {
            const control = device.controls?.find(c => c.type === ncpControlType);
            if (!control?.href) {
                return null;
            }

            const wsUrl = new URL(control.href);
            if (wsHostOverride) {
                wsUrl.hostname = wsHostOverride;
            }

            return {
                deviceId: device.id,
                deviceLabel: device.label ?? '',
                nodeId: device.node_id ?? '',
                receivers: device.receivers ?? [],
                wsUrl: wsUrl.toString()
            };
        })
        .filter((x): x is DeviceConnectionInfo => x !== null);
}

/**
 * Main application function
 */
	async function main() {
	    const sessions: DeviceSession[] = [];
	    try {
	        const registryAddress = '127.0.0.1';
	        const registryPort = 8010;
	        const is04Version = 'v1.3';
	        const registryBaseUrl = `http://${registryAddress}:${registryPort}`;
	        const useWsHostOverride = true;
	        const wsHostOverride = '127.0.0.1';
	        const telegrafAddress = '127.0.0.1';
	        const telegrafPort = 8094;

        const ncpControlType = 'urn:x-nmos:control:ncp/v1.0';

        const telegrafWriter = new TelegrafWriter(telegrafAddress, telegrafPort);
        await telegrafWriter.connect();

	        console.log(`Fetching IS-04 devices from registry: ${registryBaseUrl} (version ${is04Version})`);
	        const devices = await fetchDevicesFromRegistry(registryBaseUrl, is04Version);
	        const deviceConnections = buildDeviceConnections(devices, ncpControlType, useWsHostOverride ? wsHostOverride : undefined);

        if (deviceConnections.length === 0) {
            throw new Error(`No IS-04 devices found with NCP control type '${ncpControlType}'.`);
        }

        console.log(`✅ Found ${deviceConnections.length} device(s) with NCP control.`);
        deviceConnections.forEach(d => console.log(`\t• ${d.deviceLabel || d.deviceId} -> ${d.wsUrl}`));

        for (const deviceInfo of deviceConnections) {
            try {
                const deviceName = deviceInfo.deviceLabel || deviceInfo.deviceId;
                console.log(`\n🔌 Connecting to device: ${deviceName}`);

                const client = new WebSocketClient();
                const objectInfos = new Map<number, ObjectInfo>();
                sessions.push({ info: deviceInfo, client, objectInfos });

                client.on('notification', (notification: WebSocketNotificationMsg) => {
                    notification.notifications.forEach(n => {
                        console.log(`[${deviceName}] 🔔 notification=${JSON.stringify(n)}`);
                        const context = objectInfos.get(n.oid);
                        if (!context) {
                            console.log(`[${deviceName}] (no object info for oid ${n.oid})`);
                            return;
                        }
                        const line = mapNotificationToLine(n, context);
                        if (line) {
                            telegrafWriter.write(line);
                            console.log(`[${deviceName}] ☎️ ${line}`);
                        }
                    });
                });

                await client.connect(deviceInfo.wsUrl);

                console.log('\n📝 Find all NcReceiverMonitor [1.2.2.1] members');
                const getReceiverMonitors = await client.sendCommand<NcMethodResultBlockMemberDescriptors>(
                    1,
                    { level: 2, index: 4 },
                    { classId: [1, 2, 2, 1], includeDerived: true, recurse: true }
                );

                console.log(`✅ Found: ${getReceiverMonitors.value.length} receiver monitors`);
                getReceiverMonitors.value.forEach((member, index) => {
                    objectInfos.set(member.oid, {
                    monitorType: 'receiver_monitor',
                    tags: {
                        node_id: deviceInfo.nodeId,
                        device_id: deviceInfo.deviceId,
                        receiver_id: deviceInfo.receivers[index] ?? '',
                        receiver_role: member.role ?? '',
                        },
                        fields: {
                            user_label: member.userLabel ?? ''
                        }
                    });
                });

                const subscriptions = getReceiverMonitors.value.map(m => m.oid);
                if (subscriptions.length > 0) {
                    console.log('\n📝 Subscribe to all receiver monitor oids');
                    await client.sendSubscriptions<number[]>(subscriptions);
                    console.log(`✅ Subscribed to ${subscriptions.length} receiver monitor oid(s)`);
                }

                for (const member of getReceiverMonitors.value) {
                    console.log(`\n📝 Get overall status for receiver monitor - oid: ${member.oid}, role: ${member.role}`);
                    const getReceiverMonitorOverallStatus = await client.sendCommand<NcMethodResultNumber>(
                        member.oid, { level: 1, index: 1 }, { id: { level: 3, index: 1 } }
                    );
                    console.log('✅ Received overall status for receiver monitor: ', getReceiverMonitorOverallStatus.value);

                    console.log(`\n📝 Get link status for receiver monitor - oid: ${member.oid}, role: ${member.role}`);
                    const getReceiverMonitorLinkStatus = await client.sendCommand<NcMethodResultNumber>(
                        member.oid, { level: 1, index: 1 }, { id: { level: 4, index: 1 } }
                    );
                    console.log('✅ Received link status for receiver monitor: ', getReceiverMonitorLinkStatus.value);

                    console.log(`\n📝 Get connection status for receiver monitor - oid: ${member.oid}, role: ${member.role}`);
                    const getReceiverMonitorConnectionStatus = await client.sendCommand<NcMethodResultNumber>(
                        member.oid, { level: 1, index: 1 }, { id: { level: 4, index: 4 } }
                    );
                    console.log('✅ Received connection status for receiver monitor: ', getReceiverMonitorConnectionStatus.value);

                    console.log(`\n📝 Get sync status for receiver monitor - oid: ${member.oid}, role: ${member.role}`);
                    const getReceiverMonitorSyncStatus = await client.sendCommand<NcMethodResultNumber>(
                        member.oid, { level: 1, index: 1 }, { id: { level: 4, index: 7 } }
                    );
                    console.log('✅ Received sync status for receiver monitor: ', getReceiverMonitorSyncStatus.value);

                    console.log(`\n📝 Get stream status for receiver monitor - oid: ${member.oid}, role: ${member.role}`);
                    const getReceiverMonitorStreamStatus = await client.sendCommand<NcMethodResultNumber>(
                        member.oid, { level: 1, index: 1 }, { id: { level: 4, index: 11 } }
                    );
                    console.log('✅ Received stream status for receiver monitor: ', getReceiverMonitorStreamStatus.value);
                }

                if (process.env.DISCOVER_DEVICE_MODEL === 'true') {
                    console.log('\n📝 Discover the entire device model recursively starting from the root block with oid: 1');
                    await discoverDeviceModel(client);
                }
	            } catch (error) {
	                const wsUrl = new URL(deviceInfo.wsUrl);
	                const message = (error as Error).message;
	                console.error(`❌ Failed to connect/setup device ${deviceInfo.deviceLabel || deviceInfo.deviceId} (${deviceInfo.wsUrl}): ${message}`);
	                if (wsUrl.hostname === 'host.docker.internal' && message.includes('ENOTFOUND') && !useWsHostOverride) {
	                    console.error("Hint: 'host.docker.internal' is usually only resolvable inside Docker containers. Enable the WebSocket host override (useWsHostOverride) when running this app on the host.");
	                }
	                continue;
	            }
	        }

        console.log("\n🎉 All commands completed successfully!");
        console.log("Waiting for notifications... (Press Ctrl+C to exit)");
        // Keep the process alive to receive notifications
        // In a real app, this would be part of a larger application loop.
        // For this script, we'll just wait indefinitely.
        await new Promise(() => {}); // never resolves, hangs forever
    } catch (error) {
        console.error('❌ An error occurred in the main workflow:', (error as Error).message);
    } finally {
        sessions.forEach(s => s.client.close());
    }

    async function discoverDeviceModel(
        client: WebSocketClient,
        oid: number = 1,
        depth: number = 0
    ): Promise<void> {
        const indent = '\t'.repeat(depth);
        
        try {
            const result = await client.sendCommand<NcMethodResultBlockMemberDescriptors>(
                oid, 
                { level: 2, index: 1 }, 
                { recurse: false }
            );
            
            for (const member of result.value) {
                if(member.classId.join('.') == '1.1')
                {
                    console.log(
                        `${indent}• Block Member - oid: ${member.oid}, role: ${member.role}, classId: ${member.classId.join('.')}, finding members`
                    );

                    // Recursively discover its members
                    await discoverDeviceModel(client, member.oid, depth + 1);
                }
                else
                    console.log(
                        `${indent}• Member - oid: ${member.oid}, role: ${member.role}, classId: ${member.classId.join('.')}`
                    );
            }
        } catch (error) {
            console.error(`${indent}Error discovering members for oid ${oid}:`, error);
        }
    }
}

main();
