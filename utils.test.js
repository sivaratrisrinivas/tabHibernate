import { animateCounter } from './utils';

describe('animateCounter', () => {
  let element;

  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '<div id="testElement">0</div>';
    element = document.getElementById('testElement');
  });

  afterEach(() => {
    jest.clearAllTimers();
    document.body.innerHTML = ''; // Clean up the DOM
  });

  test('should count from start to target value', () => {
    element.textContent = '10';
    animateCounter(element, 50, 1000);
    jest.runAllTimers();
    expect(element.textContent).toBe('50');
  });

  test('should append suffix to the displayed value', () => {
    element.textContent = '5';
    animateCounter(element, 20, 1000, '%');
    jest.runAllTimers();
    expect(element.textContent).toBe('20%');
  });

  test('should not throw an error if element is null', () => {
    expect(() => {
      animateCounter(null, 10, 1000);
      jest.runAllTimers(); // Attempt to run timers even if function might have exited early
    }).not.toThrow();
  });

  test('should animate correctly to a target of 0', () => {
    element.textContent = '25';
    animateCounter(element, 0, 1000);
    jest.runAllTimers();
    expect(element.textContent).toBe('0');
  });

  test('should animate correctly when start value is 0', () => {
    element.textContent = '0';
    animateCounter(element, 30, 1000);
    jest.runAllTimers();
    expect(element.textContent).toBe('30');
  });

  test('should animate correctly when start value is not a number', () => {
    element.textContent = 'NotANumber';
    animateCounter(element, 40, 1000);
    jest.runAllTimers();
    expect(element.textContent).toBe('40');
  });

  test('should set the final target value after the duration', () => {
    element.textContent = '100';
    const target = 200;
    const duration = 1500;
    animateCounter(element, target, duration);

    // Check intermediate state (optional, but good for sanity)
    jest.advanceTimersByTime(duration / 2);
    // We can't precisely know the intermediate value without replicating the animation logic
    // So we just check it's not the initial or final value yet if duration > 0
    if (duration > 0) {
      expect(element.textContent).not.toBe(target.toString());
      expect(element.textContent).not.toBe('100');
    }


    jest.runAllTimers(); // Complete all timers
    expect(element.textContent).toBe(target.toString());
  });
});
