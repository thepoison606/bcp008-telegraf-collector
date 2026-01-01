// src/datatypes.ts

export interface Control {
    href: string;
    type: string;
}

export interface QueryApiResponse {
    id: string;
    version: string;
    label: string;
    description: string;
    controls: Control[];
    node_id?: string;
    receivers?: string[];
    senders?: string[];
}

export interface NcElementId {
    level: number;
    index: number;
}

export interface Command {
    handle: number;
    oid: number;
    methodId: NcElementId;
    arguments: object;
}

export interface WebSocketCommandMsg {
    messageType: number;
    commands: Command[];
}

export interface NcMethodResult {
    status: number;
}

export interface NcMethodResultError extends NcMethodResult {
    errorMessage: string;
}

export interface NcMethodResultString extends NcMethodResult {
    value: string;
}

export interface NcMethodResultNumber extends NcMethodResult {
    value: number;
}

export interface NcBlockMemberDescriptor {
    role: string;
    oid: number;
    constantOid: boolean;
    classId: number[];
    userLabel: string | null;
    owner: number;
}

export interface NcMethodResultBlockMemberDescriptors extends NcMethodResult {
    value: NcBlockMemberDescriptor[];
}

export interface Response {
    handle: number;
    result: NcMethodResult;
}

export interface WebSocketCommandResponseMsg {
    messageType: number;
    responses: Response[];
}

export interface WebSocketErrorMsg {
    messageType: number;
    status: number;
    errorMessage: string;
}

export enum NcPropertyChangeType {
    "ValueChanged" = 0,
    "SequenceItemAdded" = 1,
    "SequenceItemChanged" = 2,
    "SequenceItemRemoved" = 3
}

export interface NcPropertyChangedEventData {
    propertyId: NcElementId;
    changeType: NcPropertyChangeType,
    value: unknown | null,
    sequenceItemIndex: number | null
}

export interface Notification {
    oid: number;
    eventId: NcElementId;
    eventData: NcPropertyChangedEventData;
}

export interface WebSocketNotificationMsg {
    messageType: number;
    notifications: Notification[];
}

export interface MappingField {
    name: string;
    propertyId: {
        level: number;
        index: number;
    };
    type: 'integer' | 'string' | 'boolean';
    enum?: Record<string, string>;
}

export interface MappingEntry {
    table: string;
    fields: MappingField[];
}

export type MonitorType = 'receiver_monitor' | 'sender_monitor';

export type BCP008Mapping = Record<MonitorType, MappingEntry>;

export interface WebSocketSubscriptionsMsg {
    messageType: number;
    subscriptions: number[];
}

export interface WebSocketSubscriptionsResponseMsg {
    messageType: number;
    subscriptions: number[];
}

/**
 * A union type representing any possible message from the server.
 */
export type IncomingWebSocketMessage = WebSocketCommandResponseMsg | WebSocketSubscriptionsResponseMsg | WebSocketNotificationMsg | WebSocketErrorMsg;

export function isWebSocketResponse(msg: IncomingWebSocketMessage): msg is WebSocketCommandResponseMsg {
  return (msg as WebSocketCommandResponseMsg).messageType === 1;
}

export function isWebSocketNotification(msg: IncomingWebSocketMessage): msg is WebSocketNotificationMsg {
  return (msg as WebSocketNotificationMsg).messageType === 2;
}

export function isWebSocketSubscriptions(msg: IncomingWebSocketMessage): msg is WebSocketSubscriptionsResponseMsg {
  return (msg as WebSocketSubscriptionsResponseMsg).messageType === 4;
}

export function isWebSocketError(msg: IncomingWebSocketMessage): msg is WebSocketErrorMsg {
  return (msg as WebSocketErrorMsg).messageType === 5;
}
