import enum


class FuelType(str, enum.Enum):
    petrol = "petrol"          # benzină
    diesel = "diesel"          # motorină
    hybrid = "hybrid"          # hibrid
    plugin_hybrid = "plugin_hybrid"
    electric = "electric"      # electric
    lpg = "lpg"                # GPL


class Transmission(str, enum.Enum):
    manual = "manual"
    automatic = "automatic"
    semi_automatic = "semi_automatic"


class BodyType(str, enum.Enum):
    sedan = "sedan"
    hatchback = "hatchback"
    suv = "suv"
    break_ = "break"           # „break" e cuvânt rezervat în Python
    coupe = "coupe"
    cabrio = "cabrio"
    minivan = "minivan"
    pickup = "pickup"


class CarCondition(str, enum.Enum):
    new = "new"
    used = "used"
    damaged = "damaged"


class ListingStatus(str, enum.Enum):
    draft = "draft"
    active = "active"
    sold = "sold"
    inactive = "inactive"


class Currency(str, enum.Enum):
    EUR = "EUR"
    RON = "RON"
