# 🧪 Comprehensive Testing Guide

This document describes the extensive testing infrastructure for Baku Reserve.

## Table of Contents

- [Test Types](#test-types)
- [Running Tests](#running-tests)
- [Test Coverage](#test-coverage)
- [CI/CD Pipeline](#cicd-pipeline)
- [Writing Tests](#writing-tests)

## Test Types

### Backend Tests

#### Unit Tests (`backend/tests/test_*.py`)
- **test_auth.py**: Authentication and authorization
- **test_endpoint.py**: API endpoint functionality
- **test_gomap.py**: GoMap integration
- **test_intent.py**: AI intent parsing
- **test_maps.py**: Maps and directions
- **test_places_api.py**: Places API integration
- **test_preorder.py**: Reservation system
- **test_scoring.py**: Scoring algorithms

#### Integration Tests
- **test_integration_api.py**: End-to-end API workflows
- Complete user journeys
- Multi-component interactions
- Database integration

#### Performance Tests
- **test_performance.py**: Response time benchmarks
- Load testing
- Throughput testing
- Memory usage testing
- Caching effectiveness

#### Security Tests
- **test_security.py**: Security vulnerability testing
- SQL injection prevention
- XSS prevention
- Input validation
- Authentication security

#### E2E Tests
- **test_e2e_workflows.py**: Complete user workflows
- Multi-language support
- Error recovery
- Concurrent users
- Data consistency

### Mobile Tests

#### Unit Tests (`mobile/__tests__/*.test.tsx`)
- **platform.core.test.tsx**: Core platform functionality
- **experience.ui.test.tsx**: UI components and interactions
- **concierge.assistant.test.tsx**: AI concierge features

#### Integration Tests
- **integration.api.test.tsx**: API integration
- Data flow testing
- Error recovery
- Network handling

#### Performance Tests
- **performance.test.tsx**: Rendering performance
- Memory management
- State management
- Animation performance
- Scroll performance

#### Security Tests
- **security.test.tsx**: Input validation
- XSS prevention
- Secure storage
- API security
- Authentication security

## Running Tests

### Backend Tests

```bash
# All tests
cd backend
pytest tests/ -v

# With coverage
pytest tests/ --cov=app --cov-report=html

# Specific test file
pytest tests/test_integration_api.py -v

# Performance tests only
pytest tests/test_performance.py --benchmark-only

# Security tests only
pytest tests/test_security.py -v

# Parallel execution
pytest tests/ -n auto

# With timeout
pytest tests/ --timeout=300
```

### Mobile Tests

```bash
# All tests
cd mobile
npm test

# With coverage
npm test -- --coverage

# Watch mode
npm run test:watch

# Specific test file
npm test -- integration.api.test.tsx

# Update snapshots
npm test -- -u
```

### Full Test Suite

```bash
# Backend
cd backend
pytest tests/ --cov=app --cov-report=xml -v -n auto

# Mobile
cd mobile
npm test -- --coverage --maxWorkers=2 --ci

# Security scans
cd backend
bandit -r app/ -ll
safety check

cd ../mobile
npm audit --audit-level=high
```

## Test Coverage

### Coverage Requirements

- **Minimum Coverage**: 70%
- **Target Coverage**: 85%+
- **Critical Paths**: 100%

### Viewing Coverage Reports

#### Backend
```bash
cd backend
pytest tests/ --cov=app --cov-report=html
open htmlcov/index.html
```

#### Mobile
```bash
cd mobile
npm test -- --coverage
open coverage/lcov-report/index.html
```

## CI/CD Pipeline

The comprehensive CI/CD pipeline (`.github/workflows/ci.yml`) includes:

### Code Quality Checks
- **Linting**: Ruff (Python), ESLint (TypeScript)
- **Type Checking**: MyPy (Python), TypeScript
- **Formatting**: Black (Python), Prettier (TypeScript)
- **Complexity Analysis**: Radon
- **Dead Code Detection**: Vulture

### Security Scans
- **Vulnerability Scanning**: Bandit, Safety, Semgrep
- **Dependency Audits**: npm audit, Safety check
- **OWASP Checks**: Dependency-Check
- **Code Analysis**: CodeQL

### Testing Matrix
- **Unit Tests**: Python 3.11, 3.12 × Ubuntu, macOS, Windows
- **Integration Tests**: Full API workflow testing
- **E2E Tests**: Complete user journey testing
- **Performance Tests**: Load testing, benchmarks
- **Security Tests**: Penetration testing

### Build Verification
- **Backend**: Docker build, import checks
- **Mobile**: Android, iOS, Web builds
- **Documentation**: Link checking, spell checking

### Performance Metrics
- **Response Times**: < 500ms for API endpoints
- **Load Capacity**: 100+ concurrent users
- **Memory Usage**: Monitored and optimized

## Writing Tests

### Backend Test Structure

```python
"""
Module docstring describing test suite
"""
import pytest
from fastapi.testclient import TestClient
from backend.app.main import app


@pytest.fixture
def client():
    """Create test client"""
    return TestClient(app)


class TestFeatureName:
    """Test specific feature"""

    def test_specific_behavior(self, client):
        """Test description"""
        # Arrange
        data = {"key": "value"}

        # Act
        response = client.post("/api/endpoint", json=data)

        # Assert
        assert response.status_code == 200
        assert "expected_field" in response.json()
```

### Mobile Test Structure

```typescript
/**
 * Module description
 */

describe('Feature Name', () => {
  beforeEach(() => {
    // Setup
  });

  it('should behave correctly', () => {
    // Arrange
    const input = 'test';

    // Act
    const result = functionUnderTest(input);

    // Assert
    expect(result).toBe('expected');
  });
});
```

### Best Practices

1. **Test Naming**: Use descriptive names that explain what is being tested
2. **Arrange-Act-Assert**: Follow AAA pattern
3. **One Assertion Per Test**: Focus on single behavior
4. **Use Fixtures**: Share setup code with fixtures/beforeEach
5. **Mock External Dependencies**: Don't depend on external services
6. **Test Edge Cases**: Include boundary conditions
7. **Test Error Handling**: Verify error paths
8. **Performance Awareness**: Keep tests fast

### Test Categories

Use markers to categorize tests:

```python
@pytest.mark.slow
def test_slow_operation():
    pass

@pytest.mark.integration
def test_integration():
    pass

@pytest.mark.security
def test_security():
    pass
```

Run specific categories:
```bash
pytest -m "not slow"  # Skip slow tests
pytest -m integration  # Only integration tests
pytest -m security     # Only security tests
```

## Continuous Improvement

### Monitoring Test Health
- Track test execution time
- Monitor flaky tests
- Review coverage trends
- Update tests with new features

### Adding New Tests
1. Write failing test first (TDD)
2. Implement minimum code to pass
3. Refactor while keeping tests green
4. Add test to appropriate suite
5. Update this documentation

### Performance Benchmarks

Key metrics to maintain:
- Health endpoint: < 100ms
- Restaurant list: < 500ms
- Search queries: < 500ms
- Concierge AI (local): < 1s
- 50 concurrent queries: < 10s

## Troubleshooting

### Common Issues

**Tests timing out**
```bash
pytest tests/ --timeout=600  # Increase timeout
```

**Import errors**
```bash
pip install -e .  # Install in development mode
```

**Coverage not working**
```bash
pip install pytest-cov --upgrade
```

**Mobile tests failing**
```bash
cd mobile
npm ci  # Clean install
npm test -- --clearCache  # Clear Jest cache
```

## Resources

- [pytest documentation](https://docs.pytest.org/)
- [Jest documentation](https://jestjs.io/)
- [Testing Library](https://testing-library.com/)
- [FastAPI Testing](https://fastapi.tiangolo.com/tutorial/testing/)

## Contributing

When adding new features:
1. Write tests first (TDD)
2. Ensure all tests pass
3. Maintain/improve coverage
4. Update documentation
5. Run full test suite before PR

For questions or issues with tests, please open an issue or contact the team.
