"""Regression tests: real isolated MongoDB, ASGI requests, controlled provider transports.
Run with MONGO_URL and DB_NAME=atende_ia_test_*; never target a customer database.
"""
import asyncio
import hashlib
import hmac
import importlib
import json
import os
import secrets
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock

import httpx
import pytest
from motor.motor_asyncio import AsyncIOMotorClient


@pytest.fixture
async def app_env(monkeypatch):
    if not os.environ.get('DB_NAME', '').startswith('atende_ia_test'):
        pytest.skip('Requires an isolated atende_ia_test MongoDB database')
    from server import app
    from lib import db as database
    from lib.security import token_fingerprint
    mongo = AsyncIOMotorClient(os.environ['MONGO_URL'], serverSelectionTimeoutMS=5000)
    db = mongo['atende_ia_test_regression_' + uuid.uuid4().hex]
    for module in ('lib.db', 'lib.deps', 'lib.ai', 'lib.audit', 'lib.whatsapp', 'lib.prompt',
                   'routers.auth', 'routers.workspace', 'routers.inbox', 'routers.whatsapp_router', 'routers.admin', 'server'):
        monkeypatch.setattr(importlib.import_module(module), 'db', db)
    await database.ensure_indexes()
    now = datetime.now(timezone.utc)
    async def client(company_id='a', role='OWNER', platform=False):
        await db.companies.update_one({'id': company_id}, {'$setOnInsert': {
            'id': company_id, 'name': company_id, 'active': True, 'plan': 'PRO', 'created_at': now}}, upsert=True)
        uid = uuid.uuid4().hex
        await db.users.insert_one({'id': uid, 'company_id': company_id, 'name': role, 'role': role,
            'email': uid + '@example.com', 'active': True, 'created_at': now, 'is_platform_admin': platform})
        token = secrets.token_urlsafe(32)
        from lib.security import session_expiry
        await db.sessions.insert_one({'id': uuid.uuid4().hex, 'token_hash': token_fingerprint(token),
            'user_id': uid, 'company_id': company_id, 'expires_at': session_expiry()})
        return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test', cookies={'atende_session': token})
    yield app, db, client
    assert db.name.startswith('atende_ia_test_regression_')
    await mongo.drop_database(db.name)
    mongo.close()


async def test_cross_tenant_access_and_rbac(app_env):
    app, db, make_client = app_env
    from models.schemas import Customer, Conversation, KnowledgeItem, Product
    customer = Customer(company_id='a', name='Private A', phone='5511999990000')
    conv = Conversation(company_id='a', customer_id=customer.id, customer_name=customer.name, customer_phone=customer.phone)
    knowledge = KnowledgeItem(company_id='a', title='Private', content='Secret A')
    product = Product(company_id='a', name='Private', price=50)
    await db.customers.insert_one(customer.model_dump())
    await db.conversations.insert_one(conv.model_dump())
    await db.knowledge.insert_one(knowledge.model_dump())
    await db.products.insert_one(product.model_dump())
    async with await make_client('b') as b:
        for resource in ('customers', 'conversations', 'knowledge', 'products', 'appointments', 'audit-logs'):
            response = await b.get('/api/' + resource)
            assert response.status_code == 200, response.text
            assert response.json() == []
        for route in (f'/conversations/{conv.id}', f'/conversations/{conv.id}/messages'):
            assert (await b.get('/api' + route)).status_code == 404
        assert (await b.post(f'/api/conversations/{conv.id}/reply', json={'content': 'hello'})).status_code == 404
        assert (await b.delete(f'/api/customers/{customer.id}')).status_code == 404
        assert (await b.put(f'/api/customers/{customer.id}', json={'name': 'attack', 'phone': customer.phone})).status_code == 404
        assert (await b.delete(f'/api/products/{product.id}')).status_code == 404
        assert (await b.delete(f'/api/knowledge/{knowledge.id}')).status_code == 404
    async with await make_client('a', 'AGENT') as agent:
        for route, method, body in [('/company', 'PUT', {'name': 'attack'}), ('/agent-config', 'PUT', {'ai_name': 'attack'}),
                                   ('/whatsapp/web/qr', 'POST', {}), ('/whatsapp/connect', 'DELETE', {}),
                                   ('/admin/ai/credentials', 'PUT', {'provider': 'groq', 'api_key': 'attack'}),
                                   ('/auth/team', 'POST', {'name': 'attack', 'email': 'evil@example.com', 'password': 'random-test-password', 'role': 'OWNER'})]:
            response = await agent.request(method, '/api' + route, json=body)
            assert response.status_code == 403, (route, response.text)
        assert (await agent.get('/api/admin/companies')).status_code == 403
    assert (await db.customers.find_one({'id': customer.id}))['name'] == 'Private A'


async def test_all_data_routes_require_authentication(app_env):
    app, db, _ = app_env
    public = {'/api/', '/api/health', '/api/auth/login', '/api/auth/register', '/api/auth/logout',
              '/api/auth/forgot-password', '/api/auth/reset-password', '/api/auth/verify-email/confirm',
              '/api/whatsapp/web/inbound', '/api/whatsapp/webhook'}
    import re
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as anon:
        for route, methods in app.openapi()['paths'].items():
            if route in public:
                continue
            url = re.sub(r'\{[^}]+\}', 'unknown', route)
            for method in methods:
                if method.upper() not in {'GET', 'POST', 'PUT', 'PATCH', 'DELETE'}:
                    continue
                response = await anon.request(method, url, json={})
                assert response.status_code == 401, (method, route, response.status_code, response.text)


async def test_inbound_idempotency_under_concurrency(app_env, monkeypatch):
    app, db, make_client = app_env
    from routers import whatsapp_router as router
    from lib import whatsapp
    async with await make_client('a'):
        pass
    await db.integrations.insert_one({'company_id': 'a', 'kind': 'whatsapp', 'mode': 'web', 'connected': False})
    monkeypatch.setattr(router, 'run_ai_reply', AsyncMock(return_value=('Resposta real do provedor simulado', False)))
    send = AsyncMock(return_value=(True, 'accepted'))
    monkeypatch.setattr(whatsapp, 'send_message', send)
    body = {'company_id': 'a', 'external_id': 'wa-123', 'phone': '+55 (11) 99999-0000', 'name': 'Cliente', 'text': 'Olá', 'timestamp': 1700000000}
    results = await asyncio.gather(*(router._process_web_message(body) for _ in range(20)))
    assert sum(results) == 1
    assert await db.customers.count_documents({}) == 1
    assert await db.conversations.count_documents({}) == 1
    assert await db.messages.count_documents({'external_id': 'wa-123'}) == 1
    msg = await db.messages.find_one({'external_id': 'wa-123'})
    assert msg['direction'] == 'incoming' and msg['delivery_status'] == 'received'
    assert msg['created_at'].replace(tzinfo=timezone.utc).timestamp() == 1700000000
    assert send.await_count == 1
    assert (await db.messages.find_one({'role': 'ai'}))['delivery_status'] == 'accepted'


async def test_takeover_during_generation_suppresses_ai(app_env, monkeypatch):
    app, db, make_client = app_env
    from routers import whatsapp_router as router
    from lib import whatsapp
    async with await make_client('a'):
        pass
    await db.integrations.insert_one({'company_id': 'a', 'kind': 'whatsapp', 'mode': 'web'})
    async def generate(company, config, conv, text):
        await db.conversations.update_one({'id': conv['id']}, {'$set': {'ai_paused': True, 'assignee': 'Human'}})
        return 'Do not send', False
    monkeypatch.setattr(router, 'run_ai_reply', generate)
    send = AsyncMock(return_value=(True, 'accepted'))
    monkeypatch.setattr(whatsapp, 'send_message', send)
    await router._process_web_message({'company_id': 'a', 'external_id': 'wa-1', 'phone': '5511999990000', 'text': 'Olá'})
    send.assert_not_awaited()
    assert await db.messages.count_documents({'role': 'ai'}) == 0


async def test_no_mock_ai_sent_to_real_whatsapp(app_env, monkeypatch):
    app, db, make_client = app_env
    from routers import whatsapp_router as router
    from lib import ai, whatsapp
    async with await make_client('a'):
        pass
    await db.integrations.insert_one({'company_id': 'a', 'kind': 'whatsapp', 'mode': 'web'})
    monkeypatch.setattr(ai, 'generate', AsyncMock(return_value=('[modo teste] fake', 'test', 'mock')))
    send = AsyncMock()
    monkeypatch.setattr(whatsapp, 'send_message', send)
    await router._process_web_message({'company_id': 'a', 'external_id': 'wa-1', 'phone': '5511999990000', 'text': 'Olá'})
    send.assert_not_awaited()
    conv = await db.conversations.find_one({})
    assert conv['ai_paused'] is True and conv['status'] == 'precisa_humano'


async def test_failed_manual_send_is_http_error_and_recorded(app_env, monkeypatch):
    app, db, make_client = app_env
    from lib import whatsapp
    from models.schemas import Customer
    from routers.inbox import ensure_conversation
    customer = Customer(company_id='a', name='Customer', phone='5511999990000').model_dump()
    await db.customers.insert_one(customer)
    conv = await ensure_conversation('a', customer)
    monkeypatch.setattr(whatsapp, 'send_message', AsyncMock(return_value=(False, 'WhatsApp não está conectado.')))
    async with await make_client('a', 'AGENT') as agent:
        response = await agent.post(f"/api/conversations/{conv['id']}/reply", json={'content': 'hello'})
        assert response.status_code == 409
        message = await db.messages.find_one({'role': 'human'})
        assert message['delivery_status'] == 'failed'
        assert (await db.conversations.find_one({'id': conv['id']}))['ai_paused'] is True
        resumed = await agent.post(f"/api/conversations/{conv['id']}/takeover", json={'take': False})
        assert resumed.status_code == 200 and resumed.json()['ai_paused'] is False


async def test_web_send_ignores_stale_persisted_connected_flag(app_env, monkeypatch):
    app, db, make_client = app_env
    from lib import whatsapp
    await db.integrations.insert_one({'company_id': 'a', 'kind': 'whatsapp', 'mode': 'web', 'connected': False})
    send = AsyncMock(return_value=(True, 'accepted'))
    monkeypatch.setattr(whatsapp, 'web_send_message', send)
    assert (await whatsapp.send_message('a', '5511999990000', 'hello'))[0] is True
    send.assert_awaited_once()
    monkeypatch.setattr(whatsapp, 'web_status', AsyncMock(return_value={'connected': True, 'phone_number': '5511999990000'}))
    async with await make_client('a') as owner:
        assert (await owner.post('/api/whatsapp/test-send')).status_code == 200
        monkeypatch.setattr(whatsapp, 'web_status', AsyncMock(return_value={'connected': False, 'last_error': 'Conflito 440'}))
        assert (await owner.post('/api/whatsapp/test-send')).status_code == 409


async def test_internal_auth_and_meta_signature(app_env, monkeypatch):
    app, db, make_client = app_env
    from routers import whatsapp_router as router
    secret = secrets.token_hex(32)
    monkeypatch.setenv('WHATSAPP_WEB_SECRET', secret)
    monkeypatch.setenv('META_APP_SECRET', secret)
    monkeypatch.setattr(router, '_process_web_message', AsyncMock(return_value=1))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
        assert (await client.post('/api/whatsapp/web/inbound', json={})).status_code == 403
        assert (await client.post('/api/whatsapp/web/inbound', json={}, headers={'x-atende-internal-secret': secret})).status_code == 200
        payload = b'{"entry":[]}'
        assert (await client.post('/api/whatsapp/webhook', content=payload)).status_code == 403
        signature = 'sha256=' + hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
        assert (await client.post('/api/whatsapp/webhook', content=payload, headers={'x-hub-signature-256': signature})).status_code == 200
        monkeypatch.delenv('META_APP_SECRET')
        assert (await client.post('/api/whatsapp/webhook', content=payload)).status_code == 503


async def test_meta_replay_is_deduplicated_and_tenant_scoped(app_env, monkeypatch):
    app, db, make_client = app_env
    from routers import whatsapp_router as router
    from lib import whatsapp
    async with await make_client('a'):
        pass
    await db.integrations.insert_one({'company_id': 'a', 'kind': 'whatsapp', 'mode': 'official', 'connected': True, 'phone_number_id': 'meta-phone-a'})
    monkeypatch.setattr(router, 'run_ai_reply', AsyncMock(return_value=('Reply', False)))
    monkeypatch.setattr(whatsapp, 'send_message', AsyncMock(return_value=(True, 'accepted')))
    secret = secrets.token_hex(32)
    monkeypatch.setenv('META_APP_SECRET', secret)
    payload = json.dumps({'entry': [{'changes': [{'value': {'metadata': {'phone_number_id': 'meta-phone-a'},
        'messages': [{'type': 'text', 'id': 'meta-msg-1', 'from': '5511999990000', 'text': {'body': 'Olá'}}]}}]}]}).encode()
    signature = 'sha256=' + hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
        for _ in range(2):
            assert (await client.post('/api/whatsapp/webhook', content=payload, headers={'x-hub-signature-256': signature})).status_code == 200
    assert await db.messages.count_documents({'external_id': 'meta-msg-1'}) == 1
    assert await db.messages.count_documents({'company_id': 'b'}) == 0


async def test_credentials_encrypted_and_never_returned(app_env):
    app, db, make_client = app_env
    from lib import ai
    key = secrets.token_urlsafe(32)
    doc = await ai.upsert_credential({'provider': 'groq', 'api_key': key})
    stored = await db.ai_credentials.find_one({'id': doc['id']})
    assert key not in json.dumps(doc, default=str)
    assert stored['encrypted'] != key
    assert key not in json.dumps(await ai.list_credentials(), default=str)
    async with await make_client('b') as owner:
        assert (await owner.get('/api/admin/ai/credentials')).status_code == 403


async def test_reset_token_is_single_use_and_email_verification_requires_link(app_env, monkeypatch):
    app, db, make_client = app_env
    from routers import auth
    sent = AsyncMock()
    monkeypatch.setattr(auth, '_send_account_email', sent)
    async with await make_client('a') as owner:
        me = (await owner.get('/api/auth/me')).json()['user']
        response = await owner.post('/api/auth/verify-email')
        assert response.status_code == 200
        assert not (await db.users.find_one({'id': me['id']})).get('email_verified')
        token = sent.call_args.args[1]
        assert (await owner.post('/api/auth/verify-email/confirm', json={'token': token})).status_code == 200
        assert (await owner.post('/api/auth/verify-email/confirm', json={'token': token})).status_code == 400
        await owner.post('/api/auth/forgot-password', json={'email': me['email']})
        token = sent.call_args.args[1]
        data = {'token': token, 'password': secrets.token_urlsafe(18)}
        assert (await owner.post('/api/auth/reset-password', json=data)).status_code == 200
        assert (await owner.post('/api/auth/reset-password', json=data)).status_code == 400
        assert (await owner.get('/api/auth/me')).status_code == 401

async def test_session_mutations_reject_cross_origin(app_env):
    app, db, make_client = app_env
    async with await make_client('a') as owner:
        response = await owner.put('/api/company', json={'name': 'attack'}, headers={'origin': 'https://untrusted.example'})
        assert response.status_code == 403
        assert (await db.companies.find_one({'id': 'a'}))['name'] == 'a'


async def test_attendant_cannot_read_qr_or_pairing_code(app_env, monkeypatch):
    app, db, make_client = app_env
    from lib import whatsapp
    await db.integrations.insert_one({'company_id': 'a', 'kind': 'whatsapp', 'mode': 'web'})
    monkeypatch.setattr(whatsapp, 'web_status', AsyncMock(return_value={'connected': False, 'status': 'waiting_qr', 'qr': 'secret-qr', 'pairing_code': 'secret-code'}))
    async with await make_client('a', 'AGENT') as agent:
        for endpoint in ('/api/whatsapp/status', '/api/whatsapp/web/status'):
            response = await agent.get(endpoint)
            assert response.status_code == 200
            assert response.json()['web_qr'] == '' and response.json()['web_pairing_code'] == ''

async def test_ai_quota_returns_actionable_error(app_env, monkeypatch):
    app, db, make_client = app_env
    from lib import ai
    monkeypatch.setattr(ai, 'generate', AsyncMock(side_effect=ai.AiUnavailable('Limite mensal de IA atingido')))
    async with await make_client() as client:
        response = await client.post('/api/sandbox/chat', json={'message': 'Ola', 'history': []})
        assert response.status_code == 503
        assert response.json()['detail'] == 'Limite mensal de IA atingido'
