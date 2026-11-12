2
def is_prime(number: int) -> bool:
    """Return whether number is a prime number."""
    if number < 2:
        return False

    for divisor in range(2, int(number**0.5) + 1):
        if number % divisor == 0:
            return False

    return True


def main() -> None:
    try:
        number = int(input("Enter an integer: "))
    except ValueError:
        print("Invalid input. Please enter a whole number.")
        return

    if is_prime(number):
        print(f"{number} is a prime number.")
    else:
        print(f"{number} is not a prime number.")


if __name__ == "__main__":
    main()
